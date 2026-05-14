import { prisma } from './prisma';

export type CategoryConfig = {
  group: string;
  type: 'expense' | 'income' | 'transfer';
  categories: string[];
};

export const defaultCategoryConfigs: CategoryConfig[] = [
  {
    group: 'อาหารและเครื่องดื่ม',
    type: 'expense',
    categories: ['กินข้าว', 'ซื้ออาหารสด', 'กาแฟ โกโก้', 'ขนม', 'ผลไม้', 'มื้อพิเศษ', 'เลี้ยงข้าว'],
  },
  {
    group: 'การเดินทาง',
    type: 'expense',
    categories: ['น้ำมันรถ', 'ทางด่วน/จอดรถ', 'ค่ารถสาธารณะ/Taxi', 'ซ่อมแซมรถ', 'ล้างรถ', 'ประกันรถ', 'มอเตอร์ไซค์', 'Grab Transport'],
  },
  {
    group: 'ที่อยู่อาศัย',
    type: 'expense',
    categories: ['ค่าเช่า', 'ค่าน้ำ/ไฟ/เน็ต', 'ซื้อของเข้าบ้าน', 'ซ่อมแซมบ้าน', 'เครื่องใช้ไฟฟ้า', 'ค่าส่วนกลาง', 'เฟอร์นิเจอร์', 'อุปกรณ์ทำความสะอาด'],
  },
  {
    group: 'ช้อปปิ้งและของใช้',
    type: 'expense',
    categories: ['เสื้อผ้า', 'เครื่องสำอาง', 'ของใช้ส่วนตัว', 'ตัดผม ทำผม', 'ทำเล็บ', 'ของเล่น', 'Gadget', 'เครื่องประดับ'],
  },
  {
    group: 'ลูกและครอบครัว',
    type: 'expense',
    categories: ['ค่าเทอม', 'ค่าเรียนพิเศษ', 'อุปกรณ์การเรียน', 'เสื้อผ้าเด็ก', 'ของเล่นเด็ก', 'กิจกรรมเด็ก', 'ค่ารักษาพยาบาลลูก', 'เงินเดือนลูก', 'ค่าเลี้ยงดูเด็ก'],
  },
  {
    group: 'สุขภาพ',
    type: 'expense',
    categories: ['ค่ารักษาพยาบาล', 'ค่ายา/อาหารเสริม', 'ประกันสุขภาพ', 'ออกกำลังกาย', 'นวด'],
  },
  {
    group: 'การเงินและหนี้สิน',
    type: 'expense',
    categories: ['บัตรเครดิต', 'ผ่อนบ้าน/รถ', 'ดอกเบี้ย', 'ภาษี', 'ค่าธรรมเนียม', 'ประกันชีวิต', 'หนี้สินอื่นๆ', 'ผ่อนชำระ'],
  },
  {
    group: 'สังคมและความสัมพันธ์',
    type: 'expense',
    categories: ['ทำบุญ', 'ของขวัญ/ของฝาก', 'งานแต่ง/งานศพ', 'บริจาค', 'ปาร์ตี้'],
  },
  {
    group: 'ความบันเทิง',
    type: 'expense',
    categories: ['ดูหนัง/ฟังเพลง', 'เกม/เติมเกม', 'Subscription', 'เที่ยว/ที่พัก', 'กิจกรรมพักผ่อน'],
  },
  {
    group: 'รายได้',
    type: 'income',
    categories: ['เงินเดือน', 'โบนัส', 'ค่าเช่า', 'ปันผล/ดอกเบี้ย', 'ขายของ', 'ถูกหวย/รางวัล', 'เงินคืน', 'อื่นๆ'],
  },
  {
    group: 'การโอน',
    type: 'transfer',
    categories: ['โอนเงินไประหว่างบัญชี', 'ชำระบัตรเครดิต (โอน)'],
  },
];

/**
 * Seed default category groups and categories for a new family.
 * Safe to call multiple times — it skips existing groups by name.
 */
export async function seedDefaultCategories(): Promise<void> {
  for (const config of defaultCategoryConfigs) {
    const existing = await prisma.categoryGroup.findFirst({
      where: { name: config.group },
    });

    if (existing) continue;

    await prisma.categoryGroup.create({
      data: {
        name: config.group,
        type: config.type,
        categories: {
          create: config.categories.map((name) => ({ name })),
        },
      },
    });
  }
}
