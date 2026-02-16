import 'dotenv/config'
import { PrismaClient, Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import fs from 'fs'
import path from 'path'
import bcrypt from 'bcryptjs'

const connectionString = process.env.DATABASE_URL

const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// --- Helper: Parse CSV Line ---
// Handles quoted fields like "1,000.00"
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let start = 0
  let insideQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      insideQuotes = !insideQuotes
    } else if (char === ',' && !insideQuotes) {
      // Remove surrounding quotes if present
      let value = line.substring(start, i).trim()
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1)
      }
      result.push(value)
      start = i + 1
    }
  }
  // Last field
  let value = line.substring(start).trim()
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.substring(1, value.length - 1)
  }
  result.push(value)
  return result
}

// --- Helper: Parse Date DD/MM/YYYY ---
function parseDate(dateStr: string): Date {
  if (!dateStr || dateStr.trim() === '') {
    // console.warn(`Empty date string: "${dateStr}". Defaulting to current date.`)
    return new Date() 
  }
  const parts = dateStr.split('/').map(val => parseInt(val.trim()))
  if (parts.length !== 3 || parts.some(isNaN)) {
    console.warn(`Invalid date format: "${dateStr}". Defaulting to current date.`)
    return new Date()
  }
  const [day, month, year] = parts
  const date = new Date(year, month - 1, day)
  if (isNaN(date.getTime())) {
     console.warn(`Invalid date value: "${dateStr}". Defaulting to current date.`)
     return new Date()
  }
  return date
}

// --- Helper: Parse Amount ---
function parseAmount(amountStr: string): number {
  if (!amountStr) return 0
  return parseFloat(amountStr.replace(/,/g, ''))
}

async function main() {
  console.log('Start seeding...')

  // --- 0. Cleanup ---
  await prisma.transaction.deleteMany()
  await prisma.category.deleteMany()
  await prisma.categoryGroup.deleteMany()
  await prisma.account.deleteMany()
  await prisma.user.deleteMany()
  await prisma.family.deleteMany()

  // --- 0. Setup Default Password ---
  const defaultPassword = await bcrypt.hash('4444', 10)

  // --- 1. Create Family & Users ---
  console.log('Creating Family & Users...')

  const family = await prisma.family.create({
    data: { name: 'FamMee' },
  })

  // Boyz (Admin)
  const boyz = await prisma.user.create({
    data: {
      name: 'boyz',
      role: 'parent',
      isAdmin: true,
      color: '#4F46E5', // Indigo
      password: defaultPassword,
      familyId: family.id,
      accounts: {
        create: [
          { name: 'Main Bank', type: 'bank', balance: 0, color: '#007AFF' },
          { name: 'Cash Wallet', type: 'cash', balance: 0, color: '#34C759' }
        ]
      }
    },
    include: { accounts: true }
  })

  // Tukkie (Parent)
  const tukkie = await prisma.user.create({
    data: {
      name: 'tukkie',
      role: 'parent',
      isAdmin: true,
      color: '#EC4899', // Pink
      password: defaultPassword,
      familyId: family.id,
      accounts: {
        create: [
          { name: 'Main Bank', type: 'bank', balance: 0, color: '#FF2D55' },
          { name: 'Cash Wallet', type: 'cash', balance: 0, color: '#FF9500' }
        ]
      }
    },
    include: { accounts: true }
  })

  // Children
  const childrenData = [
    { name: 'Lisha', color: '#FFCC00' },
    { name: 'Lita', color: '#FF9500' },
    { name: 'Little', color: '#AF52DE' },
    { name: 'Songkran', color: '#5856D6' }
  ]
  
  // Map Name -> User
  const childrenMap = new Map<string, Prisma.UserGetPayload<{ include: { accounts: true } }>>()

  for (const child of childrenData) {
    const user = await prisma.user.create({
      data: {
        name: child.name,
        role: 'child',
        color: child.color,
        password: defaultPassword,
        familyId: family.id,
        accounts: {
          create: [
            { name: 'True Money', type: 'wallet', balance: 0, color: '#FF9500' },
            { name: 'Budget', type: 'cash', balance: 0, color: '#34C759' }, // Shared cash pot
            { name: 'Saving', type: 'bank', balance: 0, color: '#007AFF' }
          ]
        }
      },
      include: { accounts: true }
    })
    childrenMap.set(child.name, user) // Key: "Lisha", Value: UserObj
  }


  // Map for Parents CSV "Created by"
  const parentUserMap: Record<string, Prisma.UserGetPayload<{ include: { accounts: true } }>> = {
    'boyz': boyz,
    'tukkie': tukkie,
    'Adisorn Sirisunhirun': boyz,
    'Surangrat Pattharinphokin': tukkie,
  }


  // --- 2. Create Categories & Groups ---
  console.log('Creating Categories...')

  // Category Configuration
  type CategoryConfig = {
    group: string
    type: 'expense' | 'income' | 'transfer'
    categories: string[]
  }

  const categoryConfigs: CategoryConfig[] = [
    {
      group: 'อาหารและเครื่องดื่ม', // Food & Drink
      type: 'expense',
      categories: ['กินข้าว', 'ซื้ออาหารสด', 'กาแฟ โกโก้', 'ขนม', 'ผลไม้', 'มื้อพิเศษ', 'เลี้ยงข้าว']
    },
    {
      group: 'การเดินทาง', // Transportation
      type: 'expense',
      categories: ['น้ำมันรถ', 'ทางด่วน/จอดรถ', 'ค่ารถสาธารณะ/Taxi', 'ซ่อมแซมรถ', 'ล้างรถ', 'ประกันรถ', 'มอเตอร์ไซค์', 'Grab Transport']
    },
    {
      group: 'ที่อยู่อาศัย', // Housing
      type: 'expense',
      categories: ['ค่าเช่า', 'ค่าน้ำ/ไฟ/เน็ต', 'ซื้อของเข้าบ้าน', 'ซ่อมแซมบ้าน', 'เครื่องใช้ไฟฟ้า', 'ค่าส่วนกลาง', 'เฟอร์นิเจอร์', 'อุปกรณ์ทำความสะอาด']
    },
    {
      group: 'ช้อปปิ้งและของใช้', // Shopping
      type: 'expense',
      categories: ['เสื้อผ้า', 'เครื่องสำอาง', 'ของใช้ส่วนตัว', 'ตัดผม ทำผม', 'ทำเล็บ', 'ของเล่น', 'Gadget', 'เครื่องประดับ']
    },
    {
      group: 'ลูกและครอบครัว', // Family & Kids
      type: 'expense',
      categories: ['ค่าเทอม', 'ค่าเรียนพิเศษ', 'อุปกรณ์การเรียน', 'เสื้อผ้าเด็ก', 'ของเล่นเด็ก', 'กิจกรรมเด็ก', 'ค่ารักษาพยาบาลลูก', 'เงินเดือนลูก', 'ค่าเลี้ยงดูเด็ก']
    },
    {
      group: 'สุขภาพ', // Health
      type: 'expense',
      categories: ['ค่ารักษาพยาบาล', 'ค่ายา/อาหารเสริม', 'ประกันสุขภาพ', 'ออกกำลังกาย', 'นวด']
    },
    {
      group: 'การเงินและหนี้สิน', // Finance
      type: 'expense',
      categories: ['บัตรเครดิต', 'ผ่อนบ้าน/รถ', 'ดอกเบี้ย', 'ภาษี', 'ค่าธรรมเนียม', 'ประกันชีวิต', 'หนี้สินอื่นๆ', 'ผ่อนชำระ']
    },
    {
      group: 'สังคมและความสัมพันธ์', // Social
      type: 'expense',
      categories: ['ทำบุญ', 'ของขวัญ/ของฝาก', 'งานแต่ง/งานศพ', 'บริจาค', 'ปาร์ตี้']
    },
    {
      group: 'ความบันเทิง', // Entertainment
      type: 'expense',
      categories: ['ดูหนัง/ฟังเพลง', 'เกม/เติมเกม', 'Subscription', 'เที่ยว/ที่พัก', 'กิจกรรมพักผ่อน']
    },
    {
      group: 'รายได้', // Income
      type: 'income',
      categories: ['เงินเดือน', 'โบนัส', 'ค่าเช่า', 'ปันผล/ดอกเบี้ย', 'ขายของ', 'ถูกหวย/รางวัล', 'เงินคืน', 'อื่นๆ']
    },
    {
      group: 'การโอน', // Transfer
      type: 'transfer',
      categories: ['โอนเงินไประหว่างบัญชี', 'ชำระบัตรเครดิต (โอน)']
    }
  ]

  const categoryMap = new Map<string, string>() // Name -> ID

  for (const config of categoryConfigs) {
    const group = await prisma.categoryGroup.create({
      data: {
        name: config.group,
        type: config.type,
        categories: {
          create: config.categories.map(name => ({ name }))
        }
      },
      include: { categories: true }
    })
    
    // Store category mapping
    for (const cat of group.categories) {
      categoryMap.set(cat.name, cat.id)
    }
    // Also map Group Name to first Category (fallback)
    if (group.categories.length > 0) {
      categoryMap.set(group.name, group.categories[0].id)
    }
  }

  // --- 3. CSV Mappings (CSV Name -> System Category Name) ---
  const csvCategoryMapping: Record<string, string> = {
    // Food
    'กินข้าว': 'กินข้าว',
    'ซื้ออาหารสด': 'ซื้ออาหารสด',
    'กาแฟ โกโก้': 'กาแฟ โกโก้',
    'ขนม': 'ขนม',
    'ผลไม้': 'ผลไม้',
    'มื้อพิเศษ': 'มื้อพิเศษ',
    'เลี้ยงข้าว': 'เลี้ยงข้าว',
    // Transport
    'น้ำมันรถ': 'น้ำมันรถ',
    'ทางด่วน': 'ทางด่วน/จอดรถ',
    'taxi': 'ค่ารถสาธารณะ/Taxi',
    'Grab Transport': 'Grab Transport',
    'ล้างรถ': 'ล้างรถ',
    'ซ่อมแซมรถ': 'ซ่อมแซมรถ',
    'มอเตอร์ไซค์': 'มอเตอร์ไซค์',
    // Housing
    'ซื้อของเข้าบ้าน': 'ซื้อของเข้าบ้าน',
    'ซ่อมแซมบ้าน': 'ซ่อมแซมบ้าน',
    'ค่าไฟ': 'ค่าน้ำ/ไฟ/เน็ต',
    'ค่าน้ำ ค่าไฟ ค่าเนท ศรีวรา': 'ค่าน้ำ/ไฟ/เน็ต',
    'ค่าส่วนกลาง ศรีวรา': 'ค่าส่วนกลาง',
    'เครื่องกรองน้ำ': 'เครื่องใช้ไฟฟ้า',
    'ค่าใช้จ่ายอื่นๆ': 'ค่าใช้จ่ายอื่นๆ', // Fallback
    'ซื้อของ ศรีวรา': 'ซื้อของเข้าบ้าน',
    // Shopping / Personal
    'เสื้อผ้า': 'เสื้อผ้า',
    'เครื่องสำอาง': 'เครื่องสำอาง',
    'ค่าของใช้': 'ของใช้ส่วนตัว',
    'ตัดผม ทำผม': 'ตัดผม ทำผม',
    'ทำเล็บ': 'ทำเล็บ',
    'ของเล่นเด็กๆ': 'ของเล่น',
    'หนังสือเด็ก': 'อุปกรณ์การเรียน',
    // Kids / Family
    'อุปกรณ์การเรียน': 'อุปกรณ์การเรียน',
    'กิจกรรมเด็กๆ': 'กิจกรรมเด็ก',
    'ค่าเสื้อผ้าเด็ก': 'เสื้อผ้าเด็ก',
    'เงินเดือนลูก': 'เงินเดือนลูก',
    'ค่าเรียน': 'ค่าเรียนพิเศษ', 
    'ค่าเลี้ยงดูเด็ก': 'ค่าเลี้ยงดูเด็ก',
    'ค่ารักษาพยาบาลลูกๆ': 'ค่ารักษาพยาบาลลูก',
    // Health
    'ค่ารักษาพยาบาล': 'ค่ารักษาพยาบาล',
    'ยา': 'ค่ายา/อาหารเสริม',
    'นวด': 'นวด',
    // Social
    'ทำบุญ': 'ทำบุญ',
    'ของฝาก': 'ของขวัญ/ของฝาก',
    'ของขวัญ': 'ของขวัญ/ของฝาก',
    // Entertainment
    'ดูหนัง': 'ดูหนัง/ฟังเพลง',
    'subscriptions': 'Subscription',
    // Finance
    'กรุงศรี': 'บัตรเครดิต', // Might be payment
    'ไทยเครดิต': 'หนี้สินอื่นๆ', // Loan payment?
    'SCB': 'หนี้สินอื่นๆ',
    'SME BANK': 'หนี้สินอื่นๆ',
    // Income
    'เงินเดือน': 'เงินเดือน',
    'เงินเดือนดิอาท': 'เงินเดือน',
    'เงินเดือนDeluna': 'เงินเดือน',
    'ค่าเช่า Unixx': 'ค่าเช่า',
    'ค่าเช่า Centara': 'ค่าเช่า',
    'ค่าเช่า TheBase ขอนแก่น': 'ค่าเช่า',
    'ค่าเช่าศรีวรา Airbnb': 'ค่าเช่า',
    'ค่าเช่าศรีวรา Booking.com': 'ค่าเช่า',
    'ค่าเช่าสารคาม': 'ค่าเช่า',
    'หวย เก็บค่าหวย': 'ถูกหวย/รางวัล',
    // Special / Debt
    'ผ่อนบ้านศรีวรา': 'ผ่อนบ้าน/รถ',
    'The Base Height': 'ผ่อนบ้าน/รถ',
    'UNIXX พัทยา': 'ผ่อนบ้าน/รถ',
    'เซ็นทารา พัทยา': 'ผ่อนบ้าน/รถ',
  }
  
  // Custom Fallback for missing
  const defaultExpenseCategory = categoryMap.get('ค่าใช้จ่ายอื่นๆ') || categoryMap.get('กินข้าว')!
  const defaultIncomeCategory = categoryMap.get('อื่นๆ') || categoryMap.get('เงินเดือน')!


  // --- 4. Process Expense.csv (Parents) ---
  console.log('Processing Expense.csv...')
  const expenseCsvPath = path.join(process.cwd(), 'Expense.csv')
  const expenseCsvContent = fs.readFileSync(expenseCsvPath, 'utf-8')
  const expenseLines = expenseCsvContent.split('\n').slice(1) // Skip header

  let transactionCount = 0

  for (const line of expenseLines) {
    if (!line.trim()) continue
    
    // Columns: Date,Transaction,Category,Amount,Fee,Type,Created by
    const cols = parseCSVLine(line)
    if (cols.length < 7) continue // Invalid line

    const date = parseDate(cols[0])
    const note = cols[1] // "Transaction" description
    const csvCategory = cols[2]
    const amount = parseAmount(cols[3])
    // const fee = parseAmount(cols[4])
    const typeStr = cols[5] // EXPENSE or INCOME
    const creatorName = cols[6]

    const user = parentUserMap[creatorName]
    if (!user) {
      console.warn(`User not found: ${creatorName}, skipping.`)
      continue
    }

    const systemCategoryName = csvCategoryMapping[csvCategory] || csvCategory
    let categoryId = categoryMap.get(systemCategoryName)
    
    // If exact match failed, try matching group name or use defaults
    if (!categoryId) {
        // Fallback or Create Custom?
        categoryId = (typeStr === 'INCOME') ? defaultIncomeCategory : defaultExpenseCategory
    }

    // Determine User (already defined above as user)
    // const user = parentUserMap['boyz'] // Removed duplicate

    // Determine Account (Default to Main Bank)
    // user is defined at line 351
    const account = user.accounts.find((a: any) => a.name === 'Main Bank')!

    await prisma.transaction.create({
      data: {
        amount: amount,
        type: (typeStr === 'INCOME') ? 'income' : 'expense',
        date: date,
        description: note,
        category: { connect: { id: categoryId } },
        account: { connect: { id: account.id } },
        createdBy: { connect: { id: user.id } }, // Transaction Owner
        // status: 'completed'
      }
    })
    transactionCount++
  }
  console.log(`Imported ${transactionCount} transactions from Expense.csv`)


  // --- 5. Process Expense kid.csv (Children) ---
  console.log('Processing Expense kid.csv...')
  const kidCsvPath = path.join(process.cwd(), 'Expense kid.csv')
  const kidCsvContent = fs.readFileSync(kidCsvPath, 'utf-8')
  const kidLines = kidCsvContent.split('\n').slice(1) // Skip header

  // Mappings for Kids
  const kidAccountMap: Record<string, string> = {
    'True money': 'True Money',
    'Truemoney': 'True Money',
    'wallet': 'True Money',
    'เงินสด': 'Budget',
    'Cash': 'Budget', 
    'Saving': 'Saving',
    'Bank': 'Saving'
  }

  let kidCount = 0
  for (const line of kidLines) {
     if (!line.trim()) continue
     // Columns: Expense category,Detail,User,Amount,Account,Date
     const cols = parseCSVLine(line)
     if (cols.length < 6) continue

     const csvCategory = cols[0]
     const detail = cols[1]
     const userName = cols[2]
     const amount = parseAmount(cols[3])
     const accountName = cols[4]
     const date = parseDate(cols[5])

     // Find Child User
     // Map "Licha" -> "Lisha" if needed, assuming exact match from array
     let childUser = childrenMap.get(userName)
     if (!childUser) {
        // Try casing
        childUser = childrenMap.get(userName.charAt(0).toUpperCase() + userName.slice(1))
     }
     
     if (!childUser) {
        console.warn(`Child user not found: ${userName}`)
        continue
     }

     // Find Account
     const targetAccName = kidAccountMap[accountName] || accountName
     const account = childUser.accounts.find((a: any) => a.name === targetAccName) 
        || childUser.accounts.find((a: any) => a.name === 'Budget')! // Fallback to Cash

     // Map Category
     const systemCategoryName = csvCategoryMapping[csvCategory] || csvCategory
     let categoryId = categoryMap.get(systemCategoryName)
     if (!categoryId) {
        // Map common kid categories
        if (csvCategory.includes('เติมเกม') || csvCategory.includes('Game')) categoryId = categoryMap.get('เกม/เติมเกม')
        else if (csvCategory.includes('Food')) categoryId = categoryMap.get('กินข้าว')
        else categoryId = defaultExpenseCategory
     }

     await prisma.transaction.create({
        data: {
            amount: amount,
            type: 'expense', // Kids mostly expense
            date: date,
            description: detail || csvCategory,
            category: { connect: { id: categoryId } },
            account: { connect: { id: account.id } },
            createdBy: { connect: { id: childUser.id } }
        }
     })
     kidCount++
  }

  console.log(`Imported ${kidCount} transactions from Expense kid.csv`)

  // --- 6. Recalculate Account Balances ---
  console.log('Recalculating account balances...')

  const allAccounts = await prisma.account.findMany()

  for (const account of allAccounts) {
    // Outgoing transactions (this account is the source)
    const outgoing = await prisma.transaction.findMany({
      where: { accountId: account.id, status: 'completed' },
    })

    // Incoming transactions (this account is the destination for transfers)
    const incoming = await prisma.transaction.findMany({
      where: { toAccountId: account.id, status: 'completed' },
    })

    let balance = 0

    for (const tx of outgoing) {
      const amount = Number(tx.amount)
      const fee = tx.fee ? Number(tx.fee) : 0

      if (tx.type === 'income') {
        balance += amount - fee
      } else {
        // expense or transfer (source side)
        balance -= amount + fee
      }
    }

    for (const tx of incoming) {
      // transfer destination side
      balance += Number(tx.amount)
    }

    await prisma.account.update({
      where: { id: account.id },
      data: { balance },
    })

    console.log(`  ${account.name} (${account.id.slice(0, 8)}): ${balance.toFixed(2)}`)
  }

  console.log('Account balances updated.')
  console.log('Seeding finished.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
