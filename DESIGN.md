# DESIGN.md — Meta Ads Agent (Creator Console)

> ระบบดีไซน์เดียวของแอป · ทุกคอมโพเนนต์ต้องอ้างอิงไฟล์นี้
> ธีม: Light storefront (Apple-esque) — สว่าง โปร่ง มุมมนมาก ตัวอักษรใหญ่
> ไฟล์ token ที่ใช้จริง: app/styles/tokens.css (ใช้ var(--...) เท่านั้น ห้าม hex ตรง)
> มาตรฐาน: WCAG 2.2 AA · keyboard-first · focus-visible เสมอ

---

## 1. Intent

สร้าง UI ที่โปร่ง อ่านง่าย ตัดสินใจไว สำหรับทีมยิงแอด — พื้นสว่าง การ์ดลอยเบา
มุมโค้งมากให้ความรู้สึกพรีเมียมแบบ storefront · แถบเมนูดำเป็นจุดยึดสายตาเดียว

หลักการ: structured · tokenized · content-first — ห้ามมี one-off spacing/typography

---

## 2. Design Tokens

ค่าเต็มอยู่ใน `app/styles/tokens.css` — ต้องใช้ semantic token ทุกที่ · ห้ามเขียน hex ตรงในคอมโพเนนต์

### 2.1 Surfaces

| Token | ใช้กับ |
|---|---|
| --surface-base | rail (แถบดำ) |
| --surface-page | พื้นหน้า |
| --surface-sheet | การ์ด |
| --surface-raised | well · sub-panel · footer |
| --surface-inset | พื้น input |
| --surface-strong | fill · divider เข้ม |

### 2.2 Text

| Token | ใช้กับ |
|---|---|
| --text-primary | หัวข้อ · เนื้อหาหลัก |
| --text-secondary | เนื้อหารอง |
| --text-tertiary | label · caption |
| --text-muted | placeholder · disabled เท่านั้น |
| --text-inverse | บนพื้นเข้ม |

### 2.3 Brand & Semantic

- `--brand / --brand-ink`: ปุ่มหลัก · active · ลิงก์
- `--funnel-tof`: TOF — ลูกค้าใหม่
- `--funnel-mof`: MOF — เคยสนใจ
- `--funnel-bof`: BOF — ใกล้ซื้อ
- `--state-ok`: สำเร็จ · ผ่าน
- `--state-risk`: เตือน · ต้องห้าม

ต้องมีป้ายข้อความหรือ icon คู่กับสีเสมอ ห้ามใช้สีเดี่ยวสื่อความหมาย

### 2.4 Typography

Font: `--font-primary` = Satoshi, Sukhumvit Set, Noto Sans Thai, system-ui, …
Base: 16px / line-height 24px / weight 400

| Token | ใช้กับ |
|---|---|
| --font-4xl | hero หน้า marketing เท่านั้น |
| --font-3xl | display |
| --font-2xl | h1 |
| --font-xl | KPI · section title |
| --font-lg | subsection |
| --font-md | หัวการ์ด |
| --font-sm–xs | body |
| --font-data | ตาราง · mono · label หนาแน่น |

### 2.5 Spacing

ใช้ spacing scale ใน `tokens.css` เท่านั้น: `--space-1` ถึง `--space-8`; section ใหญ่ใช้ทวีคูณ 8px อย่างสม่ำเสมอ

### 2.6 Radius

- `--radius-xs`: inset เล็ก
- `--radius-sm`: chip · control เล็ก
- `--radius-md`: input
- `--radius-lg`: card
- `--radius-xl`: dropzone · hero
- `--radius-pill`: buttons/badges

### 2.7 Elevation & Motion

ใช้ `--shadow-1/2/3`, `--duration-instant`, `--duration-fast`, `--ease`; เคารพ `prefers-reduced-motion`

---

## 3. Component Rules

ทุกคอมโพเนนต์ต้องมีสถานะ default · hover · focus-visible · active · disabled · loading · error ตามบทบาท

### 3.1 Button

- Anatomy: `[icon?] label` · radius `--radius-pill` · padding `11px 22px` · font 15–16px/700
- Variants: primary / ghost / danger
- focus-visible ต้องใช้ `box-shadow: var(--focus-ring)`
- hit area ≥ 44×44px
- ปุ่ม primary ไม่เกิน 1 ต่อ view

### 3.2 Input / Budget field

- radius `--radius-md` · bg `--surface-inset`
- label ชัดเจนผูก `for/id`
- focus-within: brand border + ring
- error: border `--state-risk` + ข้อความใต้ช่อง

### 3.3 Card

- bg `--surface-sheet` · radius `--radius-lg` · border `--border-default` · shadow `--shadow-2`
- Empty state ต้องมีไอคอน + ข้อความ + CTA

### 3.4 Left Icon Rail

- bg `--surface-base` · icon/text `--nav-ink`
- มี label ใต้ icon ทุกอัน
- active: `aria-current="page"` + bg `--brand`
- Touch ≥ 44px

### 3.5 Stepper

4 ขั้น: อัปโหลด → วิเคราะห์ → ตรวจสอบ → เสร็จสิ้น; สื่อสถานะด้วยรูปทรง+ข้อความ

### 3.6 Toast

bg `--text-primary` · text `--text-inverse` · radius `--radius-md` · `aria-live="polite"`

### 3.7 Modal

`role="dialog" aria-modal="true"`; focus เข้า modal, Esc ปิด, trap focus, คืน focus

---

## 4. Accessibility Acceptance

- Keyboard: Tab ไล่ครบ · Enter/Space/Esc ทำงานตามบทบาท
- Focus-visible ทุก interactive มี ring
- Contrast text ≥ 4.5:1
- สีไม่ใช่สื่อเดียว
- Reduced motion เคารพ
- icon button มี aria-label · input มี label
- Screen reader อ่านโครงหน้า + สถานะได้

---

## 5. Content & Tone

กระชับ มั่นใจ เน้นการลงมือ · ปุ่มบอกสิ่งที่จะเกิด เช่น “สร้างในสถานะพัก (Paused) — ยังไม่มีการใช้จ่าย”

---

## 6. Anti-patterns

- ห้าม hex ตรงในคอมโพเนนต์
- ห้าม spacing/radius/type นอกสเกล
- ห้ามซ่อน focus indicator
- ห้ามใช้สีเดี่ยวสื่อความหมาย
- ห้าม icon เปล่าไม่มี label/aria
- ห้าม purple gradient / AI aesthetic
- ห้ามคอมโพเนนต์ไม่มี loading/empty/error state

---

## 7. QA Checklist

- [ ] ใช้ var(--...) ทุกสี ไม่มี hex ตรง
- [ ] spacing/radius/type อยู่ในสเกล token
- [ ] ทุกปุ่ม/ลิงก์/input มีสถานะครบ
- [ ] Tab ไล่ทั้งหน้าได้ + focus ring มองเห็น
- [ ] contrast ผ่าน axe
- [ ] funnel/state มีป้ายกำกับ
- [ ] responsive 320 / 768 / 1024 / 1440px
- [ ] loading · empty · error state ครบ
- [ ] prefers-reduced-motion เคารพ
- [ ] ไม่มี console error / axe warning

---

## 8. Migration

1. เพิ่ม `tokens.css` → import ใน `globals.css`
2. ไล่แทน hex → semantic token ทีละคอมโพเนนต์
3. ปุ่มทุกปุ่ม → `--radius-pill` · การ์ด → `--radius-lg`
4. ตรวจ contrast หลังเปลี่ยน
5. รัน QA checklist ก่อน merge
