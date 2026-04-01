/**
 * Database Seeder — like `php artisan db:seed`
 * Populates the database with sample data for development/testing.
 *
 * Usage:
 *   npm run seed                  — seed data (requires tables to exist)
 *   npm run migrate:fresh --seed  — drop, recreate, then seed
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('🌱 Seeding roles...');
    await client.query(`
      INSERT INTO roles (role_name, permissions) VALUES
        ('Admin',      '{"all": true}'),
        ('Manager',    '{"products":true,"sales":true,"purchases":true,"reports":true,"employees":true,"expenses":true}'),
        ('Cashier',    '{"sales":true,"products":{"read":true}}'),
        ('Stocker',    '{"products":true,"purchases":true,"stock":true}'),
        ('Accountant', '{"expenses":true,"accounts":true,"reports":true,"transactions":true}')
      ON CONFLICT (role_name) DO NOTHING
    `);

    console.log('🌱 Seeding users...');
    const adminHash = await bcrypt.hash('admin123', 10);
    const managerHash = await bcrypt.hash('manager123', 10);
    const cashierHash = await bcrypt.hash('cashier123', 10);
    await client.query(`
      INSERT INTO users (username, password_hash, full_name, role_id) VALUES
        ('admin',   $1, 'مدیر سیستم', 1),
        ('manager', $2, 'احمد مدیر',  2),
        ('cashier', $3, 'علی صندوقدار', 3)
      ON CONFLICT (username) DO NOTHING
    `, [adminHash, managerHash, cashierHash]);

    console.log('🌱 Seeding accounts...');
    await client.query(`
      INSERT INTO accounts (name, type, currency, balance) VALUES
        ('صندوق نقدی (افغانی)', 'cash',   'AFN', 0),
        ('حساب بانکی',          'bank',   'AFN', 0),
        ('کیف پول موبایل',      'mobile', 'AFN', 0),
        ('صندوق نقدی (دالر)',   'cash',   'USD', 0)
      ON CONFLICT DO NOTHING
    `);

    console.log('🌱 Seeding exchange rates...');
    await client.query(`
      INSERT INTO exchange_rates (currency, rate_to_afn) VALUES
        ('AFN', 1),
        ('USD', 71),
        ('IRR', 0.0017),
        ('PKR', 0.25)
      ON CONFLICT (currency) DO NOTHING
    `);

    console.log('🌱 Seeding categories...');
    await client.query(`
      INSERT INTO categories (name, description) VALUES
        ('مواد غذایی',      'مواد غذایی و خوراکی'),
        ('نوشیدنی‌ها',      'نوشیدنی و آبمیوه'),
        ('لبنیات',          'شیر، ماست، پنیر و محصولات لبنی'),
        ('لوازم خانگی',     'وسایل و لوازم خانه'),
        ('لوازم بهداشتی',   'صابون، شامپو و لوازم بهداشتی'),
        ('لوازم التحریر',   'قلم، کاغذ و نوشت‌افزار'),
        ('تنقلات',          'بسکویت، چپس و تنقلات'),
        ('حبوبات و غلات',   'برنج، آرد، لوبیا و دال')
      ON CONFLICT DO NOTHING
    `);

    console.log('🌱 Seeding suppliers...');
    await client.query(`
      INSERT INTO suppliers (name, contact_person, phone, address, payment_terms) VALUES
        ('شرکت توزیع مواد غذایی افغان', 'حاجی محمد',   '0700123456', 'کابل، مندوی',     'credit'),
        ('تجارتی نور',                   'عبدالله نوری', '0799887766', 'کابل، شهر نو',    'cash'),
        ('شرکت لبنیات تازه',            'فهیم احمدی',  '0777112233', 'کابل، خیرخانه',   'installments'),
        ('تجارتی حیدری',                 'سید حیدر',    '0700998877', 'هرات، جاده ولایت', 'credit'),
        ('پخش مواد بهداشتی پاک',        'نجیب‌الله',   '0788556644', 'کابل، کارته سه',  'cash')
      ON CONFLICT DO NOTHING
    `);

    console.log('🌱 Seeding products...');
    await client.query(`
      INSERT INTO products (barcode, name, category_id, purchase_price, sale_price, stock_quantity, unit, supplier_id) VALUES
        ('8901234001', 'روغن نباتی ۱ لیتر',         1, 120, 150, 50,  'بوتل',  1),
        ('8901234002', 'برنج باسماتی ۵ کیلو',       8, 450, 550, 30,  'بسته',  1),
        ('8901234003', 'آرد گندم ۵۰ کیلو',          8, 1800, 2100, 20, 'بوجی', 1),
        ('8901234004', 'شکر سفید ۱ کیلو',           1, 70,  90,  100, 'کیلو',  1),
        ('8901234005', 'چای سبز ۵۰۰ گرم',           1, 200, 280, 40,  'بسته',  2),
        ('8901234006', 'چای سیاه ۵۰۰ گرم',          1, 180, 250, 45,  'بسته',  2),
        ('8901234007', 'شیر تازه ۱ لیتر',           3, 50,  70,  60,  'بوتل',  3),
        ('8901234008', 'ماست ۱ کیلو',               3, 60,  85,  40,  'کیلو',  3),
        ('8901234009', 'پنیر محلی ۵۰۰ گرم',         3, 100, 140, 25,  'بسته',  3),
        ('8901234010', 'آب معدنی ۱.۵ لیتر',         2, 15,  25,  200, 'بوتل',  2),
        ('8901234011', 'نوشابه کوکاکولا ۳۳۰ مل',   2, 25,  40,  150, 'قوطی',  2),
        ('8901234012', 'صابون لباسشویی',             5, 45,  65,  80,  'عدد',   5),
        ('8901234013', 'شامپو ۲۵۰ مل',              5, 120, 170, 35,  'بوتل',  5),
        ('8901234014', 'خمیردندان',                  5, 60,  85,  50,  'عدد',   5),
        ('8901234015', 'بسکویت ۲۰۰ گرم',            7, 30,  45,  100, 'بسته',  2),
        ('8901234016', 'چپس ۱۵۰ گرم',               7, 35,  55,  80,  'بسته',  2),
        ('8901234017', 'قلم خودکار',                 6, 10,  20,  200, 'عدد',   4),
        ('8901234018', 'کتابچه ۱۰۰ برگ',            6, 25,  40,  100, 'عدد',   4),
        ('8901234019', 'دال نخود ۱ کیلو',           8, 90,  130, 60,  'کیلو',  1),
        ('8901234020', 'لوبیا سفید ۱ کیلو',         8, 110, 160, 45,  'کیلو',  1)
      ON CONFLICT (barcode) DO NOTHING
    `);

    console.log('🌱 Seeding customers...');
    await client.query(`
      INSERT INTO customers (name, phone, address, is_regular) VALUES
        ('حاجی عبدالرحمن',  '0700111222', 'کابل، خیرخانه',    true),
        ('محمد یوسف',       '0799333444', 'کابل، کارته چهار',  true),
        ('فاطمه احمدی',     '0777555666', 'کابل، تایمنی',      false),
        ('سید کریم',        '0788777888', 'کابل، شهر نو',     true),
        ('عایشه نوری',      '0700999000', 'کابل، مکروریان',    false)
      ON CONFLICT DO NOTHING
    `);

    console.log('🌱 Seeding employees...');
    await client.query(`
      INSERT INTO employees (full_name, role, salary, payment_frequency, contact) VALUES
        ('احمد ولی',    'مدیر فروش',  25000, 'monthly', '0700112233'),
        ('محمد نبی',     'صندوقدار',   15000, 'monthly', '0799445566'),
        ('فرید احمد',    'انباردار',    12000, 'monthly', '0777889900'),
        ('نجیب‌الله',   'کارگر',       8000,  'weekly',  '0788223344')
      ON CONFLICT DO NOTHING
    `);

    console.log('🌱 Seeding sarafis...');
    await client.query(`
      INSERT INTO sarafis (name, contact_person, phone, address, currency) VALUES
        ('صرافی نور', 'حاجی نور محمد', '0700555111', 'سرای شهزاده، کابل', 'AFN'),
        ('صرافی حیدری', 'سید حیدر',    '0799666222', 'سرای شهزاده، کابل', 'USD')
      ON CONFLICT DO NOTHING
    `);

    await client.query('COMMIT');
    console.log('');
    console.log('✅ Database seeded successfully!');
    console.log('');
    console.log('👤 Users created:');
    console.log('   admin   / admin123   (مدیر سیستم)');
    console.log('   manager / manager123 (مدیر)');
    console.log('   cashier / cashier123 (صندوقدار)');
    console.log('');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
