<?php

namespace Database\Seeders;

use App\Models\Category;
use Illuminate\Database\Seeder;

class CategorySeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $categories = [
            [
                'id' => 1,
                'name' => 'الهواتف الذكية',
                'description' => 'أحدث الهواتف الذكية والأجهزة المحمولة من مختلف الشركات العالمية',
            ],
            [
                'id' => 2,
                'name' => 'الحواسيب المحمولة',
                'description' => 'أجهزة اللابتوب وحواسيب العمل المتقدمة والألعاب فائقة الأداء',
            ],
            [
                'id' => 3,
                'name' => 'الساعات الذكية',
                'description' => 'أحدث الساعات الذكية وأجهزة تتبع الصحة واللياقة البدنية',
            ],
            [
                'id' => 4,
                'name' => 'الإكسسوارات والسماعات',
                'description' => 'سماعات لاسلكية، شواحن سريعة، وملحقات إلكترونية أصلية',
            ],
            [
                'id' => 5,
                'name' => 'الأجهزة اللوحية',
                'description' => 'أجهزة لوحية بشاشات فائقة الدقة للعمل، الرسم، والدراسة',
            ],
        ];

        foreach ($categories as $categoryData) {
            Category::updateOrCreate(
                ['id' => $categoryData['id']],
                $categoryData
            );
        }
    }
}

