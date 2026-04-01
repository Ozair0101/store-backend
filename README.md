"# store-backend" 
Works perfectly. Here are your commands — similar to Laravel:

Command	What it does	Laravel equivalent
npm run migrate	Create tables (safe, won't drop)	php artisan migrate
npm run migrate:fresh	Drop ALL tables, recreate	php artisan migrate:fresh
npm run seed	Seed sample data	php artisan db:seed
npm run fresh	Drop + recreate + seed	php artisan migrate:fresh --seed