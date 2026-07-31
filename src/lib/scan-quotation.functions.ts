import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const input = z.object({
  /** data URL: data:image/png;base64,.... */
  image: z.string().min(20),
});

export type ScannedQuotation = {
  title?: string | null;
  quotation_no?: string | null;
  partner_name?: string | null;
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
    "title":string|null,"quotation_no":string|null,"partner_name":string|null,
    "issue_date":"YYYY-MM-DD"|null,"expiry_date":"YYYY-MM-DD"|null,
    "amount_before_tax":number|null,"discount":number|null,"tax":number|null,
    "total_amount":number|null,"currency":string|null,"description":string|null
  },
  "confidence": {
    "title":0.0-1.0,"quotation_no":0.0-1.0,"partner_name":0.0-1.0,
    "issue_date":0.0-1.0,"expiry_date":0.0-1.0,
    "amount_before_tax":0.0-1.0,"discount":0.0-1.0,"tax":0.0-1.0,
    "total_amount":0.0-1.0,"currency":0.0-1.0,"description":0.0-1.0
  }
}
กติกา: ตัวเลขเป็นตัวเลขล้วน ไม่มีคอมมาหรือสัญลักษณ์สกุลเงิน
ถ้าเป็น พ.ศ. ให้แปลงเป็น ค.ศ. ก่อน (พ.ศ. - 543)
amount_before_tax คือยอดก่อน VAT, tax คือยอด VAT, total_amount คือยอดรวมสุทธิ
confidence คือความมั่นใจของแต่ละช่อง ใส่เป็นทศนิยมระหว่าง 0.0 ถึง 1.0 (1.0 = มั่นใจสูงสุด)
หากช่องใดอ่านไม่ได้หรือไม่แน่ใจ ให้ใส่ค่า null ทั้ง data และ confidence ของช่องนั้น
ข้อมูลที่ไม่พบให้ใส่ null`;

export const scanQuotation = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data }): Promise<ScannedQuotation> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("ยังไม่ได้ตั้งค่า AI (LOVABLE_API_KEY)");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: "ดึงข้อมูลจากใบเสนอราคานี้" },
              { type: "image_url", image_url: { url: data.image } },
            ],
          },
        ],
      }),
    });

    if (res.status === 429) throw new Error("มีการเรียกใช้ AI ถี่เกินไป กรุณาลองใหม่อีกครั้ง");
    if (res.status === 402) throw new Error("เครดิต AI หมด กรุณาเติมเครดิตใน Workspace");
    if (!res.ok) throw new Error(`สแกนไม่สำเร็จ (${res.status})`);

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("ไม่สามารถอ่านข้อมูลจากเอกสารได้");

    try {
      return JSON.parse(match[0]) as ScannedQuotation;
    } catch {
      throw new Error("ไม่สามารถอ่านข้อมูลจากเอกสารได้");
    }
  });
