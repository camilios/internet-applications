<?php

namespace Database\Seeders;

use App\Models\Product;
use Illuminate\Database\Seeder;

class ProductSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $products = [
            [
                'id' => 1,
                'name' => 'iPhone 15 Pro Max (256GB)',
                'description' => 'هاتف آبل الرائد بهيكل من التيتانيوم وشريحة A17 Pro وكاميرا متطورة بدقة 48 ميجابكسل.',
                'price' => 1199.99,
                'category_id' => 1,
                'is_active' => true,
            ],
            [
                'id' => 2,
                'name' => 'Samsung Galaxy S24 Ultra (512GB)',
                'description' => 'شاشة Dynamic AMOLED 2X بمعدل 120Hz ومعالج Snapdragon 8 Gen 3 وقلم S-Pen مدمج وميزات Galaxy AI.',
                'price' => 1299.99,
                'category_id' => 1,
                'is_active' => true,
            ],
            [
                'id' => 3,
                'name' => 'Google Pixel 8 Pro (128GB)',
                'description' => 'هاتف جوجل الذكي بشريحة Google Tensor G3 ونظام كاميرات فائق وتحديثات أمان لنظام أندرويد لـ 7 سنوات.',
                'price' => 899.99,
                'category_id' => 1,
                'is_active' => true,
            ],
            [
                'id' => 4,
                'name' => 'MacBook Pro 16" M3 Pro (18GB/512GB)',
                'description' => 'حاسوب محمول فائق القوة للمحترفين مع شاشة Liquid Retina XDR وبطارية تدوم حتى 22 ساعة.',
                'price' => 2499.00,
                'category_id' => 2,
                'is_active' => true,
            ],
            [
                'id' => 5,
                'name' => 'Dell XPS 15 OLED (Core i7 / 1TB SSD)',
                'description' => 'شاشة لمسية 3.5K OLED مذهلة وتصميم مدمج من الألومنيوم وألياف الكربون مناسب للمصممين والمطورين.',
                'price' => 1899.00,
                'category_id' => 2,
                'is_active' => true,
            ],
            [
                'id' => 6,
                'name' => 'Lenovo ThinkPad X1 Carbon Gen 11',
                'description' => 'لابتوب الأعمال الأشهر بخفة وزن استثنائية، هيكل من ألياف الكربون ولوحة مفاتيح مريحة مقاومة للسوائل.',
                'price' => 1550.00,
                'category_id' => 2,
                'is_active' => true,
            ],
            [
                'id' => 7,
                'name' => 'Apple Watch Series 9 GPS 45mm',
                'description' => 'شريحة S9 مع إيماءة الضغط المزدوج الجديدة، شاشة أكثر سطوعاً، وتتبع دقيق للمؤشرات الحيوية.',
                'price' => 399.00,
                'category_id' => 3,
                'is_active' => true,
            ],
            [
                'id' => 8,
                'name' => 'Samsung Galaxy Watch 6 Classic (47mm)',
                'description' => 'إطار دوار كلاسيكي، مراقبة متقدمة للنوم وضغط الدم وتحليل تكوين الجسم ومقاومة للماء بمعيار IP68.',
                'price' => 349.99,
                'category_id' => 3,
                'is_active' => true,
            ],
            [
                'id' => 9,
                'name' => 'AirPods Pro (الجيل الثاني - USB-C)',
                'description' => 'ميزة إلغاء الضوضاء النشط حتى ضعفي الجيل السابق، الصوت المكاني المخصص، وعلبة شحن MagSafe بمنفذ USB-C.',
                'price' => 249.00,
                'category_id' => 4,
                'is_active' => true,
            ],
            [
                'id' => 10,
                'name' => 'Sony WH-1000XM5 Wireless Headphones',
                'description' => 'سماعات رأس لاسلكية رائدة عالمياً في عزل الضوضاء، صوت عالي الدقة، ومكالمات فائقة الوضوح مع بطارية 30 ساعة.',
                'price' => 379.99,
                'category_id' => 4,
                'is_active' => true,
            ],
            [
                'id' => 11,
                'name' => 'Anker 737 Power Bank (24,000mAh, 140W)',
                'description' => 'بطارية متنقلة قوية تدعم شحن اللابتوبات والهواتف الذكية بسرعة فائقة مع شاشة رقمية لعرض استهلاك الطاقة.',
                'price' => 129.99,
                'category_id' => 4,
                'is_active' => true,
            ],
            [
                'id' => 12,
                'name' => 'iPad Air 11" M2 (128GB Wi-Fi)',
                'description' => 'جهاز آيباد نحيف وسريع جداً مدعوم بشريحة M2 القوية، متوافق مع قلم Apple Pencil Pro ولوحة مفاتيح Magic Keyboard.',
                'price' => 599.00,
                'category_id' => 5,
                'is_active' => true,
            ],
            [
                'id' => 13,
                'name' => 'iPad Pro 13" M4 (256GB Ultra Retina XDR)',
                'description' => 'أنحف جهاز صنعته آبل على الإطلاق مع شاشة OLED مزدوجة رائدة عالمياً وقوة شريحة Apple M4 الثورية.',
                'price' => 1199.00,
                'category_id' => 5,
                'is_active' => true,
            ],
            [
                'id' => 14,
                'name' => 'Samsung Galaxy Tab S9 (128GB)',
                'description' => 'تابلت أندرويد متكامل بشاشة Dynamic AMOLED 2X بتردد 120Hz، مقاوم للماء والغبار وقلم S-Pen مرفق مجاناً.',
                'price' => 799.99,
                'category_id' => 5,
                'is_active' => true,
            ],
            [
                'id' => 15,
                'name' => 'Apple Magic Keyboard لجهاز iPad',
                'description' => 'لوحة مفاتيح مع مسند عائم، مفاتيح بإضاءة خلفية، ولوحة تتبع مدمجة توفر تجربة كتابة لا تضاهى.',
                'price' => 299.00,
                'category_id' => 4,
                'is_active' => true,
            ],
        ];

        foreach ($products as $productData) {
            Product::updateOrCreate(
                ['id' => $productData['id']],
                $productData
            );
        }
    }
}

