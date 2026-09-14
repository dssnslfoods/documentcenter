import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/server-auth";

const input = z.object({
  accessToken: z.string().min(10),
  /** data URL: data:image/png;base64,.... หรือ data:application/pdf;base64,.... (ไฟล์ไม่เกิน 8MB) */
  image: z.string().min(20).max(11_500_000),
  /** ชื่อไฟล์ (ใช้เมื่อเป็น PDF) */
  filename: z.string().optional(),
});

export type ScannedItem = {
  description?: string | null;
  qty?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  amount?: number | null;
};

export type ScannedQuotation = {
  items?: ScannedItem[] | null;
  title?: string | null;
  quotation_no?: string | null;
  /** ผู้ออกใบเสนอราคา (ผู้ขาย/คู่ค้า) — มักอยู่หัวกระดาษ/โลโก้ */
  partner_name?: string | null;
  /** ผู้รับใบเสนอราคา (ลูกค้า/ผู้ซื้อ) */
  buyer_name?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  amount_before_tax?: number | null;
  discount?: number | null;
  tax?: number | null;
  total_amount?: number | null;
  currency?: string | null;
  description?: string | null;
  confidence?: {
    title?: number | null;
    quotation_no?: number | null;
    partner_name?: number | null;
    buyer_name?: number | null;
    issue_date?: number | null;
    expiry_date?: number | null;
    amount_before_tax?: number | null;
    discount?: number | null;
    tax?: number | null;
    total_amount?: number | null;
    currency?: number | null;
    description?: number | null;
  };
};

const SYSTEM = `คุณคือผู้ช่วยอ่านเอกสารใบเสนอราคา (ภาษาไทย/อังกฤษ)
อ่านรูปภาพเอกสารแล้วดึงข้อมูลออกมาเป็น JSON เท่านั้น ห้ามมีข้อความอื่น
รูปแบบ:
{
  "data": {
    "title":string|null,"quotation_no":string|null,"partner_name":string|null,"buyer_name":string|null,
    "issue_date":"YYYY-MM-DD"|null,"expiry_date":"YYYY-MM-DD"|null,
    "amount_before_tax":number|null,"discount":number|null,"tax":number|null,
    "total_amount":number|null,"currency":string|null,"description":string|null,
    "items":[{"description":string,"qty":number|null,"unit":string|null,"unit_price":number|null,"amount":number|null}]
  },
  "confidence": {
    "title":0.0-1.0,"quotation_no":0.0-1.0,"partner_name":0.0-1.0,"buyer_name":0.0-1.0,
    "issue_date":0.0-1.0,"expiry_date":0.0-1.0,
    "amount_before_tax":0.0-1.0,"discount":0.0-1.0,"tax":0.0-1.0,
    "total_amount":0.0-1.0,"currency":0.0-1.0,"description":0.0-1.0
  }
}
สำคัญมาก - การแยกชื่อบริษัท:
- partner_name = "ผู้ออกใบเสนอราคา / ผู้ขาย / ผู้เสนอราคา" คือบริษัทที่พิมพ์หัวกระดาษ (letterhead) มีโลโก้ ที่อยู่ เลขผู้เสียภาษี และมักมีคำว่า "ใบเสนอราคา / QUOTATION" อยู่ด้านบน
- buyer_name = "ผู้รับใบเสนอราคา / ลูกค้า / ผู้ซื้อ" คือชื่อที่อยู่ในช่อง "เรียน / ถึง / ลูกค้า / To / Attn / Bill To / Customer"
- ห้ามสลับกันเด็ดขาด ถ้าไม่แน่ใจว่าอันไหนคือผู้ออก ให้ใช้ชื่อที่อยู่หัวกระดาษบนสุดเป็น partner_name และลด confidence ลง
กติกา: ตัวเลขเป็นตัวเลขล้วน ไม่มีคอมมาหรือสัญลักษณ์สกุลเงิน
ถ้าเป็น พ.ศ. ให้แปลงเป็น ค.ศ. ก่อน (พ.ศ. - 543)
amount_before_tax คือยอดก่อน VAT, tax คือยอด VAT, total_amount คือยอดรวมสุทธิ
confidence คือความมั่นใจของแต่ละช่อง ใส่เป็นทศนิยมระหว่าง 0.0 ถึง 1.0 (1.0 = มั่นใจสูงสุด)
หากช่องใดอ่านไม่ได้หรือไม่แน่ใจ ให้ใส่ค่า null ทั้ง data และ confidence ของช่องนั้น
items คือรายการสินค้า/บริการในตารางของใบเสนอราคา (เรียงตามเอกสาร) หากไม่มีให้ใส่ []
ข้อมูลที่ไม่พบให้ใส่ null`;

const GEMINI_MODEL = "gemini-2.5-flash";

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) throw new Error("รูปแบบไฟล์ไม่ถูกต้อง");
  return { mimeType: match[1], base64: match[2] };
}

export const scanQuotation = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data }): Promise<ScannedQuotation> => {
    await requireUser(data.accessToken);
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("ยังไม่ได้ตั้งค่า AI (GEMINI_API_KEY)");

    const { mimeType, base64 } = parseDataUrl(data.image);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [
            {
              role: "user",
              parts: [
                { text: "ดึงข้อมูลจากใบเสนอราคานี้" },
                { inlineData: { mimeType, data: base64 } },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json" },
        }),
      },
    );

    if (res.status === 429) throw new Error("มีการเรียกใช้ AI ถี่เกินไป กรุณาลองใหม่อีกครั้ง");
    if (!res.ok) {
      const errBody = await res.text();
      console.error("Gemini scan error:", res.status, errBody);
      throw new Error(`สแกนไม่สำเร็จ (${res.status})`);
    }

    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("ไม่สามารถอ่านข้อมูลจากเอกสารได้");

    try {
      const parsed = JSON.parse(match[0]) as { data?: ScannedQuotation; confidence?: ScannedQuotation["confidence"] } | ScannedQuotation;
      // รองรับทั้งรูปแบบเก่า (flat) และรูปแบบใหม่ (data + confidence)
      const data = "data" in parsed && parsed.data ? parsed.data : (parsed as ScannedQuotation);
      const confidence = "confidence" in parsed && parsed.confidence ? parsed.confidence : undefined;
      return { ...data, confidence };
    } catch {
      throw new Error("ไม่สามารถอ่านข้อมูลจากเอกสารได้");
    }
  });
