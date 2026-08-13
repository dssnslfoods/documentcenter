import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const input = z
  .object({
    text: z.string().optional(),
    /** data URL: data:image/png;base64,.... หรือ data:application/pdf;base64,.... */
    image: z.string().min(20).optional(),
  })
  .refine((d) => !!d.text?.trim() || !!d.image, {
    message: "ต้องมีข้อความหรือรูปภาพอย่างน้อยหนึ่งอย่าง",
  });

const GEMINI_MODEL = "gemini-2.5-flash";

const SYSTEM = `คุณคือผู้ช่วยจัดทำเอกสาร RFQ / Specification ให้เป็นมืออาชีพ สำหรับใช้ส่งขอใบเสนอราคาจากผู้ขาย (supplier)

ผู้ใช้จะให้ข้อมูลมาแบบใดแบบหนึ่งหรือทั้งสองแบบ:
1. ข้อความอิสระ (อาจไม่มีโครงสร้าง สะกดตก เว้นวรรคมั่ว)
2. รูปภาพ เช่น ภาพถ่าย/แคปหน้าจอใบเสนอราคาจากผู้ขายรายอื่น ที่ผู้ใช้ต้องการนำรายละเอียดสินค้า/บริการมาใช้เป็นข้อมูลอ้างอิงเพื่อขอราคาจากผู้ขายรายใหม่

หน้าที่: อ่าน/รวบรวมข้อมูลทั้งหมดที่ได้รับ แล้วจัดทำเป็น RFQ/Spec ที่อ่านง่าย เป็นระเบียบ แบบมืออาชีพ

กติกาสำคัญ:
- ถ้ามีรูปภาพ ให้ดึงเฉพาะรายละเอียดสินค้า/บริการ สเปกทางเทคนิค จำนวน หน่วยนับ และเงื่อนไขการส่งมอบ/รับประกันที่เกี่ยวข้องกับสิ่งที่จะจัดซื้อเท่านั้น
- ห้ามนำชื่อบริษัทผู้ขายเดิม โลโก้ เลขที่เอกสารเดิม หรือราคาที่เสนอมาในภาพใส่ในผลลัพธ์เด็ดขาด เพราะผลลัพธ์นี้จะถูกส่งไปขอราคาจากผู้ขายรายใหม่ที่เป็นคู่แข่งกัน
- ห้ามเพิ่มข้อมูล ตัวเลข หรือสเปกใหม่ที่ไม่มีในต้นฉบับเด็ดขาด ห้ามสมมติเติมเอง
- ห้ามตัดข้อมูลสำคัญที่ระบุมาออก ต้องคงข้อมูลครบถ้วน
- จัดกลุ่มหัวข้อที่เกี่ยวข้องกันไว้ด้วยกัน ใช้บรรทัดหัวข้อสั้นๆ ตามด้วย bullet ("- ") สำหรับรายละเอียด
- ถ้ามีรายการย่อยในหัวข้อเดียวกัน ให้ย่อหน้าด้วย "  - " (เว้นวรรค 2 ช่อง)
- แก้คำผิด/เว้นวรรคให้ถูกต้อง แต่ห้ามเปลี่ยนความหมาย
- ใช้ภาษาเดียวกับต้นฉบับ (ไทยตอบไทย อังกฤษตอบอังกฤษ ปนกันให้คงแบบเดิมตามความเหมาะสม)
- ห้ามใช้ markdown header (#), ห้ามใช้ตาราง, ห้ามมีคำอธิบายอื่นนอกเหนือจากเนื้อหาที่จัดรูปแบบแล้ว
- ตอบเป็นข้อความล้วน (plain text) เท่านั้น ไม่ต้องห่อด้วย code block`;

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) throw new Error("รูปแบบไฟล์ไม่ถูกต้อง");
  return { mimeType: match[1], base64: match[2] };
}

export const rewriteSpecText = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data }): Promise<{ text: string }> => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("ยังไม่ได้ตั้งค่า AI (GEMINI_API_KEY)");

    const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [];
    if (data.text?.trim()) parts.push({ text: data.text.trim() });
    if (data.image) {
      const { mimeType, base64 } = parseDataUrl(data.image);
      parts.push({ inlineData: { mimeType, data: base64 } });
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts }],
        }),
      },
    );

    if (res.status === 429) throw new Error("มีการเรียกใช้ AI ถี่เกินไป กรุณาลองใหม่อีกครั้ง");
    if (!res.ok) {
      const errBody = await res.text();
      console.error("Gemini rewrite error:", res.status, errBody);
      throw new Error(`จัดรูปแบบไม่สำเร็จ (${res.status})`);
    }

    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
    if (!text) throw new Error("ไม่สามารถจัดรูปแบบข้อความได้");

    return { text };
  });
