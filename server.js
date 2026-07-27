const express = require('express');
const { Pool } = require('pg');
const app = express();
const port = process.env.PORT || 5000;

// ================================================================
//                      إعدادات CORS
// ================================================================
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());

// ================================================================
//                      الإعدادات الأساسية
// ================================================================
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('❌ FATAL: DATABASE_URL is not set!');
    process.exit(1);
}

console.log('📊 DATABASE_URL:', DATABASE_URL.replace(/:[^:]*@/, ':****@'));

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

const ADMIN_ID = 7011476249;
let dbReady = false;

// ================================================================
//                      ===== جداول العجلة =====
// ================================================================
const TABLE_SCHEMAS = {
    wheel_prizes: `
        CREATE TABLE IF NOT EXISTS wheel_prizes (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            probability DECIMAL(5,2) NOT NULL DEFAULT 0,
            icon VARCHAR(50),
            color VARCHAR(50) DEFAULT '#1a1a2e',
            color2 VARCHAR(50) DEFAULT '#16213e',
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `,
    wheel_spins: `
        CREATE TABLE IF NOT EXISTS wheel_spins (
            id SERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            prize_id INTEGER REFERENCES wheel_prizes(id) ON DELETE SET NULL,
            prize_name VARCHAR(255),
            spin_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_claimed BOOLEAN DEFAULT FALSE,
            claimed_date TIMESTAMP
        )
    `,
    wheel_settings: `
        CREATE TABLE IF NOT EXISTS wheel_settings (
            id SERIAL PRIMARY KEY,
            setting_key VARCHAR(100) UNIQUE NOT NULL,
            setting_value TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `,
    payments_log: `
        CREATE TABLE IF NOT EXISTS payments_log (
            id SERIAL PRIMARY KEY,
            payment_id VARCHAR(50) UNIQUE,
            user_id VARCHAR(50) NOT NULL,
            user_username VARCHAR(100),
            user_full_name VARCHAR(200),
            amount DECIMAL(20,2) NOT NULL,
            method VARCHAR(50) NOT NULL,
            method_type VARCHAR(20) DEFAULT 'auto',
            transaction_id VARCHAR(100),
            bonus_amount DECIMAL(20,2) DEFAULT 0,
            bonus_percent DECIMAL(5,2) DEFAULT 0,
            final_amount DECIMAL(20,2) NOT NULL,
            old_balance DECIMAL(20,2) DEFAULT 0,
            new_balance DECIMAL(20,2) DEFAULT 0,
            exchange_rate DECIMAL(10,4) DEFAULT 1.0,
            commission_amount DECIMAL(20,2) DEFAULT 0,
            referrer_id VARCHAR(50),
            ichancy_username VARCHAR(100),
            ichancy_player_id VARCHAR(50),
            status VARCHAR(20) DEFAULT 'completed',
            payment_time TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            log_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `,
    payments_stats: `
        CREATE TABLE IF NOT EXISTS payments_stats (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(50) UNIQUE,
            total_payments INTEGER DEFAULT 0,
            total_amount DECIMAL(20,2) DEFAULT 0,
            last_payment_time TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `,
    wheel_banner: `
        CREATE TABLE IF NOT EXISTS wheel_banner (
            id SERIAL PRIMARY KEY,
            text TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `
};

// ================================================================
//                      ===== جداول SPINIX =====
// ================================================================
const SPINIX_TABLES = {
    spinix_games: `
        CREATE TABLE IF NOT EXISTS spinix_games (
            id SERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            bet_amount DECIMAL(20,2) NOT NULL DEFAULT 1000,
            current_floor INTEGER DEFAULT 0,
            pending_profit DECIMAL(20,2) DEFAULT 0,
            current_multiplier DECIMAL(10,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT TRUE,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `,
    spinix_history: `
        CREATE TABLE IF NOT EXISTS spinix_history (
            id SERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            bet_amount DECIMAL(20,2) NOT NULL,
            final_floor INTEGER DEFAULT 0,
            result VARCHAR(20) DEFAULT 'loss',
            result_type VARCHAR(20) DEFAULT 'loss',
            profit DECIMAL(20,2) DEFAULT 0,
            final_multiplier DECIMAL(10,2) DEFAULT 0,
            total_floors_played INTEGER DEFAULT 0,
            successful_floors INTEGER DEFAULT 0,
            failed_floor INTEGER,
            cashout_amount DECIMAL(20,2) DEFAULT 0,
            is_profit BOOLEAN DEFAULT FALSE,
            played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `,
    spinix_stats: `
        CREATE TABLE IF NOT EXISTS spinix_stats (
            id SERIAL PRIMARY KEY,
            user_id BIGINT UNIQUE,
            total_games INTEGER DEFAULT 0,
            total_wins INTEGER DEFAULT 0,
            total_losses INTEGER DEFAULT 0,
            total_bet_amount DECIMAL(20,2) DEFAULT 0,
            total_win_amount DECIMAL(20,2) DEFAULT 0,
            total_loss_amount DECIMAL(20,2) DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `,
    spinix_settings: `
        CREATE TABLE IF NOT EXISTS spinix_settings (
            id SERIAL PRIMARY KEY,
            setting_key VARCHAR(100) UNIQUE NOT NULL,
            setting_value TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `,
    spinix_game_details: `
        CREATE TABLE IF NOT EXISTS spinix_game_details (
            id SERIAL PRIMARY KEY,
            game_id INTEGER REFERENCES spinix_games(id) ON DELETE CASCADE,
            user_id BIGINT NOT NULL,
            floor_number INTEGER NOT NULL,
            position_x DECIMAL(10,2),
            overlap_width DECIMAL(10,2),
            required_overlap DECIMAL(10,2),
            is_success BOOLEAN,
            multiplier DECIMAL(10,2),
            profit_at_floor DECIMAL(20,2),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `,
    spinix_aggregated_stats: `
        CREATE TABLE IF NOT EXISTS spinix_aggregated_stats (
            id SERIAL PRIMARY KEY,
            period_type VARCHAR(20) NOT NULL,
            period_key VARCHAR(20) NOT NULL,
            total_games INTEGER DEFAULT 0,
            total_wins INTEGER DEFAULT 0,
            total_losses INTEGER DEFAULT 0,
            total_cashouts INTEGER DEFAULT 0,
            total_bet_amount DECIMAL(20,2) DEFAULT 0,
            total_win_amount DECIMAL(20,2) DEFAULT 0,
            total_loss_amount DECIMAL(20,2) DEFAULT 0,
            total_players INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(period_type, period_key)
        )
    `
};

// ================================================================
//                      ===== البيانات الافتراضية =====
// ================================================================

const DEFAULT_PRIZES = [
    { name: '🎁 1000 SYP', description: 'الفوز بـ 1000 ليرة سورية', probability: 15, icon: '🎁', color: '#1a1a2e', color2: '#16213e' },
    { name: '🎁 500 SYP', description: 'الفوز بـ 500 ليرة سورية', probability: 20, icon: '🎁', color: '#2d1b3d', color2: '#1a0a0a' },
    { name: '🎁 200 SYP', description: 'الفوز بـ 200 ليرة سورية', probability: 30, icon: '🎁', color: '#0f3460', color2: '#1a1a2e' },
    { name: '🎫 كود هدية', description: 'كود هدية بقيمة 50 SYP', probability: 10, icon: '🎫', color: '#1a2a1a', color2: '#0f1a0f' },
    { name: '😅 حظ سعيد', description: 'لا يوجد فوز هذه المرة', probability: 20, icon: '😅', color: '#2a1a1a', color2: '#1a0a0a' },
    { name: '⭐ 50 SYP', description: 'الفوز بـ 50 ليرة سورية', probability: 5, icon: '⭐', color: '#1a1a2a', color2: '#0f0f2a' }
];

const DEFAULT_SETTINGS = [
    { key: 'spin_interval_hours', value: '24' },
    { key: 'is_active', value: 'true' },
    { key: 'deposit_required', value: 'false' },
    { key: 'deposit_min_amount', value: '1000' },
    { key: 'deposit_check_hours', value: '24' },
    { key: 'center_icon', value: '⭐' },
    { key: 'bg_image_url', value: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1920&q=80' },
    { key: 'loading_image_url', value: 'https://via.placeholder.com/200/1a1a2e/FFD700?text=🎡' },
    { key: 'spin_duration', value: '3500' }
];

const DEFAULT_SPINIX_SETTINGS = [
    { key: 'bet_amount', value: '1000' },
    { key: 'max_floors', value: '13' },
    { key: 'is_active', value: 'true' },
    { key: 'min_required_overlap', value: '0.5' },
    { key: 'deposit_required', value: 'true' },
    { key: 'deposit_min_amount', value: '2000' },
    { key: 'deposit_check_hours', value: '48' },
    { key: 'deposit_reset_after_round', value: 'true' },
    { key: 'bg_image_url', value: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1920&q=80' },
    { key: 'floor_image_url', value: 'https://i.imgur.com/3zW7n8A.png' },
    { key: 'loading_image_url', value: 'https://via.placeholder.com/200/1a1a2e/FFD700?text=🎡' },
    { key: 'logo_text', value: 'SPINIX' },
    { key: 'primary_color', value: '#FFD700' },
    { key: 'secondary_color', value: '#FF6B35' },
    { key: 'background_gradient_start', value: '#0a0e27' },
    { key: 'background_gradient_end', value: '#1a1a3e' }
];

const DEFAULT_SPINIX_MULTIPLIERS = {
    1: 0.5, 2: 0.7, 3: 0.9, 4: 1.1, 5: 1.3,
    6: 1.5, 7: 1.7, 8: 3.0, 9: 5.0, 10: 7.0,
    11: 9.0, 12: 11.0, 13: 15.0
};

// ================================================================
//                      ===== دوال العجلة المساعدة =====
// ================================================================

async function updateTableSchema() {
    const client = await pool.connect();
    try {
        console.log('📋 ===== التحقق من هيكل الجداول =====');
        
        const checkColumns = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'wheel_prizes' 
            AND column_name IN ('color', 'color2')
        `);
        
        const existingColumns = checkColumns.rows.map(row => row.column_name);
        console.log('📋 الأعمدة الموجودة:', existingColumns);
        
        if (!existingColumns.includes('color')) {
            console.log('➕ إضافة عمود color...');
            await client.query(`
                ALTER TABLE wheel_prizes 
                ADD COLUMN color VARCHAR(50) DEFAULT '#1a1a2e'
            `);
            console.log('✅ تم إضافة عمود color');
        }
        
        if (!existingColumns.includes('color2')) {
            console.log('➕ إضافة عمود color2...');
            await client.query(`
                ALTER TABLE wheel_prizes 
                ADD COLUMN color2 VARCHAR(50) DEFAULT '#16213e'
            `);
            console.log('✅ تم إضافة عمود color2');
        }
        
        const checkUpdatedAt = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'wheel_prizes' 
            AND column_name = 'updated_at'
        `);
        
        if (checkUpdatedAt.rows.length === 0) {
            console.log('➕ إضافة عمود updated_at...');
            await client.query(`
                ALTER TABLE wheel_prizes 
                ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            `);
            console.log('✅ تم إضافة عمود updated_at');
        }
        
        console.log('✅ ===== هيكل الجدول محدث =====');
        return true;
    } catch (error) {
        console.error('❌ خطأ في تحديث هيكل الجدول:', error);
        return false;
    } finally {
        client.release();
    }
}

// ================================================================
//                      ===== دوال SPINIX المساعدة =====
// ================================================================

async function getSpinixSetting(key) {
    const result = await pool.query(
        'SELECT setting_value FROM spinix_settings WHERE setting_key = $1',
        [key]
    );
    return result.rows[0]?.setting_value;
}

async function getSpinixMultiplier(floor) {
    const result = await pool.query(
        'SELECT setting_value FROM spinix_settings WHERE setting_key = $1',
        [`multiplier_${floor}`]
    );
    return parseFloat(result.rows[0]?.setting_value || 0);
}

async function checkSpinixDepositRequirement(user_id) {
    const depositRequired = await getSpinixSetting('deposit_required');
    const isDepositRequired = depositRequired === 'true';

    if (!isDepositRequired) {
        return { canPlay: true, required: false };
    }

    const minAmount = parseFloat(await getSpinixSetting('deposit_min_amount') || 2000);
    const checkHours = parseInt(await getSpinixSetting('deposit_check_hours') || 48);
    const resetAfterRound = await getSpinixSetting('deposit_reset_after_round') === 'true';

    const userDeposits = await pool.query(`
        SELECT COALESCE(SUM(final_amount), 0) as total
        FROM payments_log
        WHERE user_id = $1 
        AND status = 'completed'
        AND payment_time >= NOW() - INTERVAL '${checkHours} hours'
    `, [user_id]);

    const totalDeposits = parseFloat(userDeposits.rows[0]?.total || 0);

    if (resetAfterRound) {
        const hasConsumedRound = await pool.query(`
            SELECT EXISTS (
                SELECT 1 FROM spinix_games 
                WHERE user_id = $1 
                AND is_active = false
                AND started_at >= NOW() - INTERVAL '${checkHours} hours'
            ) as has_played
        `, [user_id]);

        if (hasConsumedRound.rows[0]?.has_played) {
            return {
                canPlay: false,
                required: true,
                reason: 'لقد استهلكت جولتك. قم بإيداع جديد للعب',
                min_amount: minAmount,
                check_hours: checkHours,
                current_deposits: totalDeposits,
                is_met: false,
                round_consumed: true
            };
        }
    }

    const isMet = totalDeposits >= minAmount;

    return {
        canPlay: isMet,
        required: true,
        reason: isMet ? '' : `مطلوب إيداع ${minAmount} SYP خلال آخر ${checkHours} ساعة`,
        min_amount: minAmount,
        check_hours: checkHours,
        current_deposits: totalDeposits,
        is_met: isMet,
        remaining: isMet ? 0 : minAmount - totalDeposits,
        round_consumed: false
    };
}

async function updateSpinixStats(user_id, isWin, isLoss, profit, betAmount) {
    await pool.query(`
        INSERT INTO spinix_stats (user_id, total_games, total_wins, total_losses, total_bet_amount, total_win_amount, total_loss_amount)
        VALUES ($1, 1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id) 
        DO UPDATE SET 
            total_games = spinix_stats.total_games + 1,
            total_wins = spinix_stats.total_wins + $2,
            total_losses = spinix_stats.total_losses + $3,
            total_bet_amount = spinix_stats.total_bet_amount + $4,
            total_win_amount = spinix_stats.total_win_amount + $5,
            total_loss_amount = spinix_stats.total_loss_amount + $6,
            updated_at = CURRENT_TIMESTAMP
    `, [
        user_id, 
        isWin ? 1 : 0, 
        isLoss ? 1 : 0, 
        betAmount, 
        isWin || profit > 0 ? profit : 0, 
        isLoss ? betAmount : 0
    ]);
}

async function updateAggregatedStats(periodType, gamesCount, betAmount, wins, winAmount, lossAmount, cashouts, players) {
    const now = new Date();
    let periodKey;
    
    if (periodType === 'daily') {
        periodKey = now.toISOString().split('T')[0];
    } else if (periodType === 'weekly') {
        const weekNum = getWeekNumber(now);
        periodKey = `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
    }

    await pool.query(`
        INSERT INTO spinix_aggregated_stats (
            period_type, period_key, 
            total_games, total_bet_amount, total_wins, total_win_amount, 
            total_loss_amount, total_cashouts, total_players
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (period_type, period_key) 
        DO UPDATE SET 
            total_games = spinix_aggregated_stats.total_games + $3,
            total_bet_amount = spinix_aggregated_stats.total_bet_amount + $4,
            total_wins = spinix_aggregated_stats.total_wins + $5,
            total_win_amount = spinix_aggregated_stats.total_win_amount + $6,
            total_loss_amount = spinix_aggregated_stats.total_loss_amount + $7,
            total_cashouts = spinix_aggregated_stats.total_cashouts + $8,
            total_players = spinix_aggregated_stats.total_players + $9,
            updated_at = CURRENT_TIMESTAMP
    `, [periodType, periodKey, gamesCount, betAmount, wins || 0, winAmount || 0, lossAmount || 0, cashouts || 0, players || 0]);
}

function getWeekNumber(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

async function recordSpinixGameResult(user_id, gameData, resultData) {
    const {
        result, profit, finalFloor, finalMultiplier, 
        betAmount, totalFloors, successfulFloors, failedFloor, cashoutAmount    
    } = resultData;

    try {
        const historyResult = await pool.query(`
            INSERT INTO spinix_history (
                user_id, bet_amount, final_floor, result, result_type,
                profit, final_multiplier, total_floors_played, successful_floors,
                failed_floor, cashout_amount, is_profit,
                played_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING id
        `, [
            user_id, betAmount, finalFloor, result, result,
            profit, finalMultiplier, totalFloors || 0, successfulFloors || 0,
            failedFloor || null, cashoutAmount || 0, profit > 0
        ]);

        return { success: true, historyId: historyResult.rows[0].id };
    } catch (error) {
        console.error('❌ خطأ في تسجيل النتيجة:', error);
        return { success: false, error: error.message };
    }
}

async function resetSpinixDeposit(user_id) {
    console.log(`🔄 Reset deposit flag for user ${user_id}`);
}

// ================================================================
//                      ===== تهيئة قاعدة البيانات =====
// ================================================================
async function ensureTables() {
    console.log('\n📋 ===== فحص قاعدة البيانات =====');
    
    const client = await pool.connect();

    try {
        // 1. إنشاء جداول العجلة
        for (const table of Object.keys(TABLE_SCHEMAS)) {
            try {
                await client.query(TABLE_SCHEMAS[table]);
                console.log(`   ✅ جدول ${table}: تم إنشاؤه/تأكيده`);
            } catch (err) {
                console.log(`   ❌ جدول ${table}: فشل - ${err.message}`);
                return false;
            }
        }
        
        await updateTableSchema();

        // 2. إضافة الجوائز الافتراضية للعجلة
        const prizesCount = await client.query('SELECT COUNT(*) FROM wheel_prizes');
        if (parseInt(prizesCount.rows[0].count) === 0) {
            console.log('   ⚠️ لا توجد جوائز، جاري إضافة الجوائز الافتراضية...');
            for (const prize of DEFAULT_PRIZES) {
                await client.query(`
                    INSERT INTO wheel_prizes (name, description, probability, icon, color, color2)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [prize.name, prize.description, prize.probability, prize.icon, prize.color, prize.color2]);
            }
            console.log(`   ✅ تم إضافة ${DEFAULT_PRIZES.length} جائزة افتراضية`);
        } else {
            console.log('   🔄 تحديث الجوائز الموجودة بالألوان الافتراضية...');
            await client.query(`
                UPDATE wheel_prizes 
                SET color = COALESCE(color, '#1a1a2e'),
                    color2 = COALESCE(color2, '#16213e')
                WHERE color IS NULL OR color2 IS NULL
            `);
        }

        // 3. إضافة إعدادات العجلة الافتراضية
        const settingsCount = await client.query('SELECT COUNT(*) FROM wheel_settings');
        if (parseInt(settingsCount.rows[0].count) === 0) {
            console.log('   ⚠️ لا توجد إعدادات، جاري إضافة الإعدادات الافتراضية...');
            for (const setting of DEFAULT_SETTINGS) {
                await client.query(`
                    INSERT INTO wheel_settings (setting_key, setting_value)
                    VALUES ($1, $2)
                `, [setting.key, setting.value]);
            }
            console.log(`   ✅ تم إضافة ${DEFAULT_SETTINGS.length} إعداد افتراضي`);
        }

        // 4. إضافة النص العلوي للعجلة
        const bannerCount = await client.query('SELECT COUNT(*) FROM wheel_banner');
        if (parseInt(bannerCount.rows[0].count) === 0) {
            await client.query(`
                INSERT INTO wheel_banner (text)
                VALUES ($1)
            `, ['🎡 IChancy · عجلة الحظ']);
            console.log('   ✅ تم إضافة النص العلوي الافتراضي');
        }

        // ============================================================
        // 5. إنشاء جداول SPINIX
        // ============================================================
        for (const table of Object.keys(SPINIX_TABLES)) {
            try {
                await client.query(SPINIX_TABLES[table]);
                console.log(`   ✅ جدول ${table}: تم إنشاؤه/تأكيده`);
            } catch (err) {
                console.log(`   ❌ جدول ${table}: فشل - ${err.message}`);
                return false;
            }
        }

        // 6. إضافة إعدادات SPINIX الافتراضية
        const spinixSettingsCount = await client.query('SELECT COUNT(*) FROM spinix_settings');
        if (parseInt(spinixSettingsCount.rows[0].count) === 0) {
            console.log('   ⚠️ لا توجد إعدادات لـ SPINIX، جاري الإضافة...');
            for (const setting of DEFAULT_SPINIX_SETTINGS) {
                await client.query(`
                    INSERT INTO spinix_settings (setting_key, setting_value)
                    VALUES ($1, $2)
                `, [setting.key, setting.value]);
            }
            for (const [floor, multiplier] of Object.entries(DEFAULT_SPINIX_MULTIPLIERS)) {
                await client.query(`
                    INSERT INTO spinix_settings (setting_key, setting_value)
                    VALUES ($1, $2)
                `, [`multiplier_${floor}`, multiplier.toString()]);
            }
            console.log(`   ✅ تم إضافة ${DEFAULT_SPINIX_SETTINGS.length + Object.keys(DEFAULT_SPINIX_MULTIPLIERS).length} إعداد لـ SPINIX`);
        }

        console.log('\n✅ ===== قاعدة البيانات جاهزة! =====');
        dbReady = true;
        return true;

    } catch (err) {
        console.error('❌ خطأ أثناء تهيئة قاعدة البيانات:', err);
        return false;
    } finally {
        client.release();
    }
}

// ================================================================
//                      ===== مسارات العجلة =====
// ================================================================

app.get('/api/status', (req, res) => {
    res.json({
        status: 'running',
        service: 'Wheel of Fortune API',
        timestamp: new Date().toISOString(),
        database: { ready: dbReady }
    });
});

app.get('/', (req, res) => {
    res.json({
        status: 'running',
        service: 'Wheel of Fortune API',
        message: '🚀 الخادم يعمل',
        endpoints: {
            spin: 'POST /api/wheel/spin',
            history: 'GET /api/wheel/history/:user_id',
            prizes: 'GET /api/prizes',
            admin: {
                settings: 'GET /api/admin/settings',
                setting: 'PUT /api/admin/setting',
                prizes: 'GET /api/admin/prizes',
                add_prize: 'POST /api/admin/prizes',
                update_prize: 'PUT /api/admin/prizes/:prize_id',
                delete_prize: 'DELETE /api/admin/prizes/:prize_id',
                seed_prizes: 'POST /api/admin/seed-prizes',
                reset_spins: 'POST /api/admin/reset-spins'
            }
        }
    });
});

app.get('/api/banner', async (req, res) => {
    try {
        const result = await pool.query('SELECT text FROM wheel_banner ORDER BY id DESC LIMIT 1');
        res.json({
            success: true,
            text: result.rows[0]?.text || '🎡 IChancy · عجلة الحظ'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.put('/api/banner', async (req, res) => {
    const { admin_id, text } = req.body;

    if (parseInt(admin_id) !== ADMIN_ID) {
        return res.status(403).json({
            success: false,
            error: 'Unauthorized - Admin only'
        });
    }

    try {
        await pool.query(`
            INSERT INTO wheel_banner (text, updated_at)
            VALUES ($1, CURRENT_TIMESTAMP)
        `, [text]);

        res.json({
            success: true,
            message: 'Banner updated successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/admin/settings', async (req, res) => {
    const { admin_id } = req.query;

    if (parseInt(admin_id) !== ADMIN_ID) {
        return res.status(403).json({
            success: false,
            error: 'Unauthorized - Admin only'
        });
    }

    try {
        const result = await pool.query('SELECT * FROM wheel_settings');
        const settings = {};
        result.rows.forEach(row => {
            settings[row.setting_key] = row.setting_value;
        });

        const banner = await pool.query('SELECT text FROM wheel_banner ORDER BY id DESC LIMIT 1');
        settings.banner_text = banner.rows[0]?.text || '🎡 IChancy · عجلة الحظ';

        console.log('📋 Settings loaded:', Object.keys(settings).length, 'keys');
        
        res.json({
            success: true,
            settings
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.put('/api/admin/setting', async (req, res) => {
    const { admin_id, key, value } = req.body;

    console.log(`📝 Updating setting: ${key} = ${value}`);

    if (parseInt(admin_id) !== ADMIN_ID) {
        return res.status(403).json({
            success: false,
            error: 'Unauthorized - Admin only'
        });
    }

    if (!key) {
        return res.status(400).json({
            success: false,
            error: 'Key is required'
        });
    }

    try {
        if (key === 'banner_text') {
            await pool.query(`
                INSERT INTO wheel_banner (text, updated_at)
                VALUES ($1, CURRENT_TIMESTAMP)
            `, [value]);
        } else {
            await pool.query(`
                INSERT INTO wheel_settings (setting_key, setting_value, updated_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (setting_key) 
                DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP
            `, [key, value]);
        }

        console.log(`✅ Setting ${key} updated successfully`);
        
        res.json({
            success: true,
            message: 'Setting updated successfully'
        });
    } catch (error) {
        console.error(`❌ Error updating setting ${key}:`, error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/admin/prizes', async (req, res) => {
    const { admin_id } = req.query;

    if (parseInt(admin_id) !== ADMIN_ID) {
        return res.status(403).json({
            success: false,
            error: 'Unauthorized - Admin only'
        });
    }

    try {
        const result = await pool.query(`
            SELECT * FROM wheel_prizes 
            ORDER BY id ASC
        `);
        
        console.log(`📋 Loaded ${result.rows.length} prizes for admin`);
        
        res.json({
            success: true,
            prizes: result.rows
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/prizes', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM wheel_prizes 
            WHERE is_active = true
            ORDER BY id ASC
        `);
        
        res.json({
            success: true,
            prizes: result.rows
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/admin/prizes', async (req, res) => {
    const { admin_id, name, description, probability, icon, color, color2 } = req.body;

    console.log(`📝 Adding new prize: ${name}`);

    if (parseInt(admin_id) !== ADMIN_ID) {
        return res.status(403).json({
            success: false,
            error: 'Unauthorized - Admin only'
        });
    }

    if (!name || probability === undefined) {
        return res.status(400).json({
            success: false,
            error: 'Name and probability are required'
        });
    }

    try {
        const result = await pool.query(`
            INSERT INTO wheel_prizes (name, description, probability, icon, color, color2, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, true)
            RETURNING *
        `, [name, description || '', probability, icon || '🎁', color || '#1a1a2e', color2 || '#16213e']);

        console.log(`✅ Prize added: ${result.rows[0].id} - ${name}`);

        res.json({
            success: true,
            prize: result.rows[0],
            message: '✅ تم إضافة الجائزة بنجاح'
        });
    } catch (error) {
        console.error('❌ Error adding prize:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.put('/api/admin/prizes/:prize_id', async (req, res) => {
    const { prize_id } = req.params;
    const { admin_id, name, description, probability, icon, color, color2, is_active } = req.body;

    console.log(`📝 Updating prize ${prize_id}:`, { name, probability, color, color2 });

    if (parseInt(admin_id) !== ADMIN_ID) {
        return res.status(403).json({
            success: false,
            error: 'Unauthorized - Admin only'
        });
    }

    try {
        let query = 'UPDATE wheel_prizes SET ';
        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (name !== undefined && name !== null && name !== '') {
            updates.push(`name = $${paramIndex++}`);
            values.push(name);
        }
        if (description !== undefined && description !== null) {
            updates.push(`description = $${paramIndex++}`);
            values.push(description);
        }
        if (probability !== undefined && probability !== null) {
            updates.push(`probability = $${paramIndex++}`);
            values.push(parseFloat(probability));
        }
        if (icon !== undefined && icon !== null && icon !== '') {
            updates.push(`icon = $${paramIndex++}`);
            values.push(icon);
        }
        if (color !== undefined && color !== null && color !== '') {
            updates.push(`color = $${paramIndex++}`);
            values.push(color);
            console.log(`🎨 Setting color to: ${color}`);
        }
        if (color2 !== undefined && color2 !== null && color2 !== '') {
            updates.push(`color2 = $${paramIndex++}`);
            values.push(color2);
            console.log(`🎨 Setting color2 to: ${color2}`);
        }
        if (is_active !== undefined && is_active !== null) {
            updates.push(`is_active = $${paramIndex++}`);
            values.push(is_active === true || is_active === 'true');
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No fields to update'
            });
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(prize_id);

        const fullQuery = query + updates.join(', ') + ` WHERE id = $${values.length} RETURNING *`;

        console.log('📝 Full query:', fullQuery);
        console.log('📝 Values:', values);

        const result = await pool.query(fullQuery, values);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Prize not found'
            });
        }

        console.log('✅ Prize updated:', result.rows[0]);

        res.json({
            success: true,
            prize: result.rows[0],
            message: '✅ تم تحديث الجائزة بنجاح'
        });
    } catch (error) {
        console.error('❌ Update error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.delete('/api/admin/prizes/:prize_id', async (req, res) => {
    const { prize_id } = req.params;
    const { admin_id } = req.body;

    console.log(`🗑️ Deleting prize ${prize_id}`);

    if (parseInt(admin_id) !== ADMIN_ID) {
        return res.status(403).json({
            success: false,
            error: 'Unauthorized - Admin only'
        });
    }

    try {
        await pool.query(
            'UPDATE wheel_spins SET prize_id = NULL WHERE prize_id = $1',
            [prize_id]
        );

        const result = await pool.query(
            'DELETE FROM wheel_prizes WHERE id = $1 RETURNING id',
            [prize_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Prize not found'
            });
        }

        console.log(`✅ Prize ${prize_id} deleted successfully`);

        res.json({
            success: true,
            message: '✅ تم حذف الجائزة بنجاح'
        });
    } catch (error) {
        console.error('❌ Delete error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/admin/seed-prizes', async (req, res) => {
    const { admin_id } = req.body;

    if (parseInt(admin_id) !== ADMIN_ID) {
        return res.status(403).json({
            success: false,
            error: 'Unauthorized - Admin only'
        });
    }

    try {
        await pool.query('UPDATE wheel_spins SET prize_id = NULL');
        await pool.query('DELETE FROM wheel_prizes');
        
        for (const prize of DEFAULT_PRIZES) {
            await pool.query(`
                INSERT INTO wheel_prizes (name, description, probability, icon, color, color2, is_active)
                VALUES ($1, $2, $3, $4, $5, $6, true)
            `, [prize.name, prize.description, prize.probability, prize.icon, prize.color, prize.color2]);
        }

        console.log('🔄 Prizes reset to defaults');

        res.json({
            success: true,
            message: '✅ تم إعادة تعيين الجوائز الافتراضية بنجاح!'
        });
    } catch (error) {
        console.error('❌ Reset error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/admin/reset-spins', async (req, res) => {
    const { admin_id, user_id } = req.body;

    console.log(`🔄 Resetting spins: admin=${admin_id}, user=${user_id || 'all'}`);

    if (parseInt(admin_id) !== ADMIN_ID) {
        return res.status(403).json({
            success: false,
            error: 'Unauthorized - Admin only'
        });
    }

    try {
        let deletedCount;
        
        if (user_id) {
            const result = await pool.query(
                'DELETE FROM wheel_spins WHERE user_id = $1 RETURNING id',
                [user_id]
            );
            deletedCount = result.rowCount;
            console.log(`🗑️ Deleted ${deletedCount} spins for user ${user_id}`);
        } else {
            const result = await pool.query('DELETE FROM wheel_spins RETURNING id');
            deletedCount = result.rowCount;
            console.log(`🗑️ Deleted ${deletedCount} spins for all users`);
        }

        await pool.query('ALTER SEQUENCE wheel_spins_id_seq RESTART WITH 1');

        res.json({
            success: true,
            deleted_count: deletedCount,
            message: `✅ تم حذف ${deletedCount} تدوير${user_id ? ` للمستخدم ${user_id}` : ''} بنجاح`
        });

    } catch (error) {
        console.error('❌ Reset spins error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/wheel/spin', async (req, res) => {
    const { user_id } = req.body;

    if (!user_id) {
        return res.status(400).json({
            success: false,
            error: 'user_id is required'
        });
    }

    if (!dbReady) {
        return res.status(503).json({
            success: false,
            error: 'Database is not ready. Please try again later.'
        });
    }

    try {
        console.log(`🎡 Spin request for user: ${user_id}`);

        const isActive = await pool.query(
            'SELECT setting_value FROM wheel_settings WHERE setting_key = $1',
            ['is_active']
        );
        if (isActive.rows[0]?.setting_value !== 'true') {
            return res.status(403).json({
                success: false,
                error: 'العجلة معطلة حالياً'
            });
        }

        const depositRequired = await pool.query(
            'SELECT setting_value FROM wheel_settings WHERE setting_key = $1',
            ['deposit_required']
        );
        const isDepositRequired = depositRequired.rows[0]?.setting_value === 'true';

        if (isDepositRequired) {
            const minAmount = await pool.query(
                'SELECT setting_value FROM wheel_settings WHERE setting_key = $1',
                ['deposit_min_amount']
            );
            const checkHours = await pool.query(
                'SELECT setting_value FROM wheel_settings WHERE setting_key = $1',
                ['deposit_check_hours']
            );
            
            const minAmountValue = parseFloat(minAmount.rows[0]?.setting_value || 1000);
            const checkHoursValue = parseInt(checkHours.rows[0]?.setting_value || 24);

            const userDeposits = await pool.query(`
                SELECT COALESCE(SUM(final_amount), 0) as total
                FROM payments_log
                WHERE user_id = $1 
                AND status = 'completed'
                AND payment_time >= NOW() - INTERVAL '${checkHoursValue} hours'
            `, [user_id]);

            const totalDeposits = parseFloat(userDeposits.rows[0]?.total || 0);

            if (totalDeposits < minAmountValue) {
                return res.status(403).json({
                    success: false,
                    error: `مطلوب إيداع ${minAmountValue} SYP خلال آخر ${checkHoursValue} ساعة`,
                    deposit_required: true,
                    min_deposit: minAmountValue,
                    check_hours: checkHoursValue,
                    current_deposits: totalDeposits,
                    remaining: minAmountValue - totalDeposits
                });
            }
        }

        const intervalHours = await pool.query(
            'SELECT setting_value FROM wheel_settings WHERE setting_key = $1',
            ['spin_interval_hours']
        );
        const intervalHoursValue = parseInt(intervalHours.rows[0]?.setting_value || 24);

        const lastSpin = await pool.query(`
            SELECT spin_date FROM wheel_spins 
            WHERE user_id = $1 
            ORDER BY spin_date DESC 
            LIMIT 1
        `, [user_id]);

        if (lastSpin.rows.length > 0) {
            const lastSpinDate = new Date(lastSpin.rows[0].spin_date);
            const now = new Date();
            const hoursDiff = (now - lastSpinDate) / (1000 * 60 * 60);

            console.log(`⏰ Last spin: ${lastSpinDate}, Now: ${now}, Diff: ${hoursDiff}h`);

            if (hoursDiff < intervalHoursValue) {
                const remainingHours = Math.ceil(intervalHoursValue - hoursDiff);
                const remainingMinutes = Math.ceil((intervalHoursValue - hoursDiff) * 60);
                
                return res.status(429).json({
                    success: false,
                    error: `يمكنك التدوير مرة أخرى بعد ${remainingHours} ساعة`,
                    remaining_hours: Math.floor(remainingHours),
                    remaining_minutes: remainingMinutes % 60
                });
            }
        } else {
            console.log(`👤 User ${user_id} has no previous spins`);
        }

        const prizes = await pool.query(`
            SELECT * FROM wheel_prizes 
            WHERE is_active = true
        `);

        if (prizes.rows.length === 0) {
            return res.status(500).json({
                success: false,
                error: 'لا توجد جوائز متاحة'
            });
        }

        const totalProbability = prizes.rows.reduce((sum, p) => sum + parseFloat(p.probability), 0);
        let random = Math.random() * totalProbability;
        let selectedPrize = prizes.rows[0];

        for (const prize of prizes.rows) {
            if (random <= parseFloat(prize.probability)) {
                selectedPrize = prize;
                break;
            }
            random -= parseFloat(prize.probability);
        }

        console.log(`🎯 Selected prize: ${selectedPrize.name} (${selectedPrize.probability}%)`);

        const result = await pool.query(`
            INSERT INTO wheel_spins (user_id, prize_id, prize_name, is_claimed)
            VALUES ($1, $2, $3, FALSE)
            RETURNING id, spin_date
        `, [user_id, selectedPrize.id, selectedPrize.name]);

        console.log(`✅ Spin recorded: ID=${result.rows[0].id}, User=${user_id}, Prize=${selectedPrize.name}`);

        const userStats = await pool.query(`
            SELECT 
                COUNT(*) as total_spins,
                COUNT(CASE WHEN prize_name NOT LIKE '%حظ سعيد%' THEN 1 END) as wins
            FROM wheel_spins 
            WHERE user_id = $1
        `, [user_id]);

        res.json({
            success: true,
            spin: {
                id: result.rows[0].id,
                prize: selectedPrize,
                spin_date: result.rows[0].spin_date
            },
            stats: {
                total_spins: parseInt(userStats.rows[0].total_spins),
                wins: parseInt(userStats.rows[0].wins)
            }
        });

    } catch (error) {
        console.error('❌ Spin error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/wheel/history/:user_id', async (req, res) => {
    const { user_id } = req.params;

    if (!dbReady) {
        return res.status(503).json({
            success: false,
            error: 'Database is not ready.'
        });
    }

    try {
        const lastSpin = await pool.query(`
            SELECT spin_date FROM wheel_spins 
            WHERE user_id = $1 
            ORDER BY spin_date DESC 
            LIMIT 1
        `, [user_id]);

        const intervalHours = await pool.query(
            'SELECT setting_value FROM wheel_settings WHERE setting_key = $1',
            ['spin_interval_hours']
        );
        const intervalHoursValue = parseInt(intervalHours.rows[0]?.setting_value || 24);

        const depositRequired = await pool.query(
            'SELECT setting_value FROM wheel_settings WHERE setting_key = $1',
            ['deposit_required']
        );
        const isDepositRequired = depositRequired.rows[0]?.setting_value === 'true';
        
        let depositInfo = null;
        if (isDepositRequired) {
            const minAmount = await pool.query(
                'SELECT setting_value FROM wheel_settings WHERE setting_key = $1',
                ['deposit_min_amount']
            );
            const checkHours = await pool.query(
                'SELECT setting_value FROM wheel_settings WHERE setting_key = $1',
                ['deposit_check_hours']
            );
            const minAmountValue = parseFloat(minAmount.rows[0]?.setting_value || 1000);
            const checkHoursValue = parseInt(checkHours.rows[0]?.setting_value || 24);

            const userDeposits = await pool.query(`
                SELECT COALESCE(SUM(final_amount), 0) as total
                FROM payments_log
                WHERE user_id = $1 
                AND status = 'completed'
                AND payment_time >= NOW() - INTERVAL '${checkHoursValue} hours'
            `, [user_id]);

            depositInfo = {
                required: true,
                min_amount: minAmountValue,
                check_hours: checkHoursValue,
                current_deposits: parseFloat(userDeposits.rows[0]?.total || 0),
                is_met: parseFloat(userDeposits.rows[0]?.total || 0) >= minAmountValue
            };
        }

        let can_spin = true;
        let remaining_hours = 0;
        let remaining_minutes = 0;

        if (lastSpin.rows.length > 0) {
            const lastSpinDate = new Date(lastSpin.rows[0].spin_date);
            const now = new Date();
            const hoursDiff = (now - lastSpinDate) / (1000 * 60 * 60);

            if (hoursDiff < intervalHoursValue) {
                can_spin = false;
                remaining_hours = Math.floor(intervalHoursValue - hoursDiff);
                remaining_minutes = Math.ceil((intervalHoursValue - hoursDiff) * 60) % 60;
            }
        }

        if (isDepositRequired && depositInfo && !depositInfo.is_met) {
            can_spin = false;
        }

        const stats = await pool.query(`
            SELECT 
                COUNT(*) as total_spins,
                COUNT(CASE WHEN prize_name NOT LIKE '%حظ سعيد%' THEN 1 END) as wins
            FROM wheel_spins 
            WHERE user_id = $1
        `, [user_id]);

        res.json({
            success: true,
            stats: {
                total_spins: parseInt(stats.rows[0].total_spins),
                wins: parseInt(stats.rows[0].wins)
            },
            spin_status: {
                can_spin: can_spin,
                remaining_hours: remaining_hours,
                remaining_minutes: remaining_minutes,
                interval_hours: intervalHoursValue
            },
            deposit_requirement: depositInfo
        });

    } catch (error) {
        console.error('History error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ================================================================
//                      ===== مسارات SPINIX =====
// ================================================================

app.get('/api/spinix/status', async (req, res) => {
    const { user_id } = req.query;
    
    if (!user_id) {
        return res.status(400).json({
            success: false,
            error: 'user_id is required'
        });
    }

    try {
        const isActive = await getSpinixSetting('is_active');
        if (isActive !== 'true') {
            return res.status(403).json({
                success: false,
                error: 'اللعبة معطلة حالياً'
            });
        }

        const depositCheck = await checkSpinixDepositRequirement(user_id);
        
        const activeGame = await pool.query(`
            SELECT * FROM spinix_games 
            WHERE user_id = $1 AND is_active = true
        `, [user_id]);

        const lastGame = await pool.query(`
            SELECT * FROM spinix_history 
            WHERE user_id = $1 
            ORDER BY played_at DESC 
            LIMIT 1
        `, [user_id]);

        const stats = await pool.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END), 0) as wins,
                COALESCE(SUM(CASE WHEN result = 'cashout' THEN 1 ELSE 0 END), 0) as cashouts,
                COALESCE(SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END), 0) as losses,
                COALESCE(COUNT(*), 0) as total_games
            FROM spinix_history 
            WHERE user_id = $1
        `, [user_id]);

        let canPlay = false;
        let reason = '';
        
        if (!depositCheck.canPlay) {
            canPlay = false;
            reason = depositCheck.reason;
        } else if (activeGame.rows.length > 0) {
            canPlay = true;
            reason = 'continue';
        } else {
            canPlay = true;
            reason = 'new_game';
        }

        res.json({
            success: true,
            can_play: canPlay,
            reason: reason,
            deposit_requirement: depositCheck,
            active_game: activeGame.rows[0] || null,
            last_game: lastGame.rows[0] || null,
            stats: {
                wins: parseInt(stats.rows[0].wins),
                cashouts: parseInt(stats.rows[0].cashouts),
                losses: parseInt(stats.rows[0].losses),
                total_games: parseInt(stats.rows[0].total_games)
            }
        });

    } catch (error) {
        console.error('❌ Spinix status error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/spinix/start', async (req, res) => {
    const { user_id } = req.body;

    if (!user_id) {
        return res.status(400).json({
            success: false,
            error: 'user_id is required'
        });
    }

    try {
        const isActive = await getSpinixSetting('is_active');
        if (isActive !== 'true') {
            return res.status(403).json({
                success: false,
                error: 'اللعبة معطلة حالياً'
            });
        }

        const depositCheck = await checkSpinixDepositRequirement(user_id);
        if (!depositCheck.canPlay) {
            return res.status(403).json({
                success: false,
                error: depositCheck.reason,
                deposit_required: true,
                ...depositCheck
            });
        }

        const betAmount = parseFloat(await getSpinixSetting('bet_amount') || 1000);

        const activeGame = await pool.query(`
            SELECT * FROM spinix_games 
            WHERE user_id = $1 AND is_active = true
        `, [user_id]);

        if (activeGame.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'لديك جولة نشطة، استكملها أولاً',
                game: activeGame.rows[0]
            });
        }

        const result = await pool.query(`
            INSERT INTO spinix_games (user_id, bet_amount, current_floor, pending_profit, current_multiplier)
            VALUES ($1, $2, 0, 0, 0)
            RETURNING *
        `, [user_id, betAmount]);

        await pool.query(`
            INSERT INTO spinix_stats (user_id, total_games, total_bet_amount)
            VALUES ($1, 1, $2)
            ON CONFLICT (user_id) 
            DO UPDATE SET 
                total_games = spinix_stats.total_games + 1,
                total_bet_amount = spinix_stats.total_bet_amount + $2,
                updated_at = CURRENT_TIMESTAMP
        `, [user_id, betAmount]);

        await updateAggregatedStats('daily', 1, betAmount, 0, 0, 0, 0, 1);

        console.log(`🎮 SPINIX game started for user ${user_id}, bet: ${betAmount}`);

        res.json({
            success: true,
            message: '✅ بدأت جولة جديدة!',
            game: result.rows[0],
            bet_amount: betAmount,
            deposit_check: depositCheck
        });

    } catch (error) {
        console.error('❌ Spinix start error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/spinix/drop', async (req, res) => {
    const { user_id, floor_number, position_x, overlap_width, required_overlap } = req.body;

    if (!user_id) {
        return res.status(400).json({
            success: false,
            error: 'user_id is required'
        });
    }

    try {
        const betAmount = parseFloat(await getSpinixSetting('bet_amount') || 1000);
        const maxFloor = parseInt(await getSpinixSetting('max_floors') || 13);
        const minOverlap = parseFloat(await getSpinixSetting('min_required_overlap') || 0.5);

        const gameResult = await pool.query(`
            SELECT * FROM spinix_games 
            WHERE user_id = $1 AND is_active = true
        `, [user_id]);

        if (gameResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'لا توجد جولة نشطة'
            });
        }

        const game = gameResult.rows[0];
        const currentFloor = game.current_floor;

        if (floor_number !== currentFloor + 1) {
            return res.status(400).json({
                success: false,
                error: 'خطأ في ترتيب الطوابق'
            });
        }

        const multiplier = await getSpinixMultiplier(floor_number);
        const isSuccess = overlap_width >= (required_overlap || minOverlap);
        const profit = isSuccess ? betAmount * multiplier : 0;

        await pool.query(`
            INSERT INTO spinix_game_details 
            (game_id, user_id, floor_number, position_x, overlap_width, required_overlap, is_success, multiplier, profit_at_floor)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [game.id, user_id, floor_number, position_x, overlap_width, required_overlap, isSuccess, multiplier, profit]);

        if (isSuccess) {
            if (floor_number >= maxFloor) {
                await pool.query(`
                    UPDATE spinix_games 
                    SET is_active = false, 
                        current_floor = $1,
                        pending_profit = $2,
                        current_multiplier = $3,
                        last_updated = CURRENT_TIMESTAMP
                    WHERE user_id = $4
                `, [floor_number, profit, multiplier, user_id]);

                await recordSpinixGameResult(user_id, game, {
                    result: 'win',
                    profit: profit,
                    finalFloor: floor_number,
                    finalMultiplier: multiplier,
                    betAmount: betAmount,
                    totalFloors: floor_number,
                    successfulFloors: floor_number,
                    failedFloor: null,
                    cashoutAmount: 0
                });

                await updateSpinixStats(user_id, true, false, profit, betAmount);
                await updateAggregatedStats('daily', 0, 0, 1, profit, 0, 0, 0);
                await resetSpinixDeposit(user_id);

                return res.json({
                    success: true,
                    result: 'completed',
                    floor_number: floor_number,
                    multiplier: multiplier,
                    profit: profit,
                    message: '🏆 أكملت البرج بالكامل! تهانينا!'
                });
            } else {
                await pool.query(`
                    UPDATE spinix_games 
                    SET current_floor = $1,
                        pending_profit = $2,
                        current_multiplier = $3,
                        last_updated = CURRENT_TIMESTAMP
                    WHERE user_id = $4
                `, [floor_number, profit, multiplier, user_id]);

                return res.json({
                    success: true,
                    result: 'continue',
                    floor_number: floor_number,
                    multiplier: multiplier,
                    profit: profit,
                    message: `✅ اجتزت الطابق ${floor_number}`
                });
            }
        } else {
            await pool.query(`
                UPDATE spinix_games 
                SET is_active = false,
                    last_updated = CURRENT_TIMESTAMP
                WHERE user_id = $1
            `, [user_id]);

            const successfulFloors = floor_number - 1;

            await recordSpinixGameResult(user_id, game, {
                result: 'loss',
                profit: -betAmount,
                finalFloor: floor_number - 1,
                finalMultiplier: 0,
                betAmount: betAmount,
                totalFloors: floor_number,
                successfulFloors: successfulFloors,
                failedFloor: floor_number,
                cashoutAmount: 0
            });

            await updateSpinixStats(user_id, false, true, 0, betAmount);
            await updateAggregatedStats('daily', 0, betAmount, 0, 0, betAmount, 0, 0);
            await resetSpinixDeposit(user_id);

            return res.json({
                success: false,
                result: 'loss',
                floor_number: floor_number,
                message: '💔 خسارة! انهار الطابق',
                details: {
                    bet_amount: betAmount,
                    lost_amount: betAmount,
                    floors_passed: successfulFloors,
                    failed_at: floor_number
                }
            });
        }

    } catch (error) {
        console.error('❌ Spinix drop error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/spinix/cashout', async (req, res) => {
    const { user_id } = req.body;

    if (!user_id) {
        return res.status(400).json({
            success: false,
            error: 'user_id is required'
        });
    }

    try {
        const betAmount = parseFloat(await getSpinixSetting('bet_amount') || 1000);

        const gameResult = await pool.query(`
            SELECT * FROM spinix_games 
            WHERE user_id = $1 AND is_active = true
        `, [user_id]);

        if (gameResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'لا توجد جولة نشطة'
            });
        }

        const game = gameResult.rows[0];
        const profit = game.pending_profit;

        if (profit <= 0) {
            return res.status(400).json({
                success: false,
                error: 'لا توجد أرباح لجمعها'
            });
        }

        await pool.query(`
            UPDATE spinix_games 
            SET is_active = false,
                last_updated = CURRENT_TIMESTAMP
            WHERE user_id = $1
        `, [user_id]);

        const floorsCount = await pool.query(`
            SELECT COUNT(*) as count, 
                   COUNT(CASE WHEN is_success = true THEN 1 END) as success_count
            FROM spinix_game_details 
            WHERE game_id = $1
        `, [game.id]);

        const totalFloors = parseInt(floorsCount.rows[0]?.count || 0);
        const successfulFloors = parseInt(floorsCount.rows[0]?.success_count || 0);

        await recordSpinixGameResult(user_id, game, {
            result: 'cashout',
            profit: profit,
            finalFloor: game.current_floor,
            finalMultiplier: game.current_multiplier,
            betAmount: betAmount,
            totalFloors: totalFloors,
            successfulFloors: successfulFloors,
            failedFloor: null,
            cashoutAmount: profit
        });

        await updateSpinixStats(user_id, true, false, profit, betAmount);
        await updateAggregatedStats('daily', 0, 0, 0, profit, 0, 1, 0);
        await resetSpinixDeposit(user_id);

        res.json({
            success: true,
            profit: profit,
            message: `💰 تم جمع ${profit.toFixed(2)} SYP بنجاح!`,
            details: {
                bet_amount: betAmount,
                profit: profit,
                total_return: betAmount + profit,
                floors_passed: game.current_floor,
                multiplier: game.current_multiplier,
                total_floors: totalFloors,
                successful_floors: successfulFloors
            }
        });

    } catch (error) {
        console.error('❌ Spinix cashout error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/spinix/history/:user_id', async (req, res) => {
    const { user_id } = req.params;
    const { limit, offset } = req.query;

    const limitNum = parseInt(limit) || 20;
    const offsetNum = parseInt(offset) || 0;

    try {
        const history = await pool.query(`
            SELECT 
                id, bet_amount, final_floor, result, profit, final_multiplier,
                total_floors_played, successful_floors, failed_floor, cashout_amount,
                is_profit, played_at,
                CASE 
                    WHEN result = 'loss' THEN '💔 خسارة'
                    WHEN result = 'win' THEN '🏆 فوز كامل'
                    WHEN result = 'cashout' THEN '💰 جمع أرباح'
                END as result_text,
                CASE 
                    WHEN profit > 0 THEN CONCAT('+', profit)
                    WHEN profit < 0 THEN CONCAT(profit)
                    ELSE '0'
                END as profit_text
            FROM spinix_history
            WHERE user_id = $1
            ORDER BY played_at DESC
            LIMIT $2 OFFSET $3
        `, [user_id, limitNum, offsetNum]);

        const stats = await pool.query(`
            SELECT 
                COUNT(*) as total_games,
                COUNT(CASE WHEN result = 'win' THEN 1 END) as total_wins,
                COUNT(CASE WHEN result = 'cashout' THEN 1 END) as total_cashouts,
                COUNT(CASE WHEN result = 'loss' THEN 1 END) as total_losses,
                COALESCE(SUM(CASE WHEN is_profit = true THEN profit ELSE 0 END), 0) as total_profit,
                COALESCE(SUM(CASE WHEN is_profit = false THEN bet_amount ELSE 0 END), 0) as total_loss
            FROM spinix_history
            WHERE user_id = $1
        `, [user_id]);

        res.json({
            success: true,
            history: history.rows,
            stats: {
                total_games: parseInt(stats.rows[0]?.total_games || 0),
                total_wins: parseInt(stats.rows[0]?.total_wins || 0),
                total_cashouts: parseInt(stats.rows[0]?.total_cashouts || 0),
                total_losses: parseInt(stats.rows[0]?.total_losses || 0),
                total_profit: parseFloat(stats.rows[0]?.total_profit || 0),
                total_loss: parseFloat(stats.rows[0]?.total_loss || 0),
                net_result: parseFloat(stats.rows[0]?.total_profit || 0) - parseFloat(stats.rows[0]?.total_loss || 0)
            },
            pagination: {
                limit: limitNum,
                offset: offsetNum
            }
        });

    } catch (error) {
        console.error('❌ Spinix history error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/spinix/game/:game_id', async (req, res) => {
    const { game_id } = req.params;

    try {
        const gameInfo = await pool.query(`
            SELECT 
                h.*,
                CASE 
                    WHEN h.result = 'loss' THEN '💔 خسارة'
                    WHEN h.result = 'win' THEN '🏆 فوز كامل'
                    WHEN h.result = 'cashout' THEN '💰 جمع أرباح'
                END as result_text
            FROM spinix_history h
            WHERE h.id = $1
        `, [game_id]);

        if (gameInfo.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'الجولة غير موجودة'
            });
        }

        const floors = await pool.query(`
            SELECT 
                floor_number, position_x, overlap_width, required_overlap,
                is_success, multiplier, profit_at_floor,
                CASE 
                    WHEN is_success = true THEN '✅ نجاح'
                    ELSE '❌ فشل'
                END as status_text,
                CONCAT(ROUND((overlap_width / NULLIF(required_overlap, 0)) * 100), '%') as overlap_percentage
            FROM spinix_game_details
            WHERE game_id = $1
            ORDER BY floor_number
        `, [game_id]);

        res.json({
            success: true,
            game: gameInfo.rows[0],
            floors: floors.rows,
            summary: {
                total_floors: floors.rows.length,
                successful_floors: floors.rows.filter(f => f.is_success).length,
                failed_floors: floors.rows.filter(f => !f.is_success).length,
                max_multiplier: Math.max(...floors.rows.map(f => f.multiplier || 0), 0),
                total_profit: gameInfo.rows[0].profit
            }
        });

    } catch (error) {
        console.error('❌ Game details error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ================================================================
//                      ===== إدارة SPINIX =====
// ================================================================

app.get('/api/spinix/admin/settings', async (req, res) => {
    const { admin_id } = req.query;

    if (parseInt(admin_id) !== ADMIN_ID) {
        return res.status(403).json({
            success: false,
            error: 'Unauthorized - Admin only'
        });
    }

    try {
        const result = await pool.query('SELECT * FROM spinix_settings');
        const settings = {};
        const multipliers = {};
        
        result.rows.forEach(row => {
            if (row.setting_key.startsWith('multiplier_')) {
                const floor = parseInt(row.setting_key.replace('multiplier_', ''));
                multipliers[floor] = parseFloat(row.setting_value);
            } else {
                settings[row.setting_key] = row.setting_value;
            }
        });

        res.json({
            success: true,
            settings: settings,
            multipliers: multipliers
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.put('/api/spinix/admin/setting', async (req, res) => {
    const { admin_id, key, value } = req.body;

    if (parseInt(admin_id) !== ADMIN_ID) {
        return res.status(403).json({
            success: false,
            error: 'Unauthorized - Admin only'
        });
    }

    if (!key) {
        return res.status(400).json({
            success: false,
            error: 'Key is required'
        });
    }

    try {
        await pool.query(`
            INSERT INTO spinix_settings (setting_key, setting_value, updated_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (setting_key) 
            DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP
        `, [key, value]);

        res.json({
            success: true,
            message: '✅ تم تحديث الإعداد بنجاح'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.put('/api/spinix/admin/multipliers', async (req, res) => {
    const { admin_id, multipliers } = req.body;

    if (parseInt(admin_id) !== ADMIN_ID) {
        return res.status(403).json({
            success: false,
            error: 'Unauthorized - Admin only'
        });
    }

    if (!multipliers || typeof multipliers !== 'object') {
        return res.status(400).json({
            success: false,
            error: 'مطلوب كائن المضاعفات'
        });
    }

    try {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            for (const [floor, multiplier] of Object.entries(multipliers)) {
                const numMultiplier = parseFloat(multiplier);
                if (isNaN(numMultiplier) || numMultiplier < 0) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({
                        success: false,
                        error: `قيمة مضاعف غير صالحة للطابق ${floor}`
                    });
                }

                await client.query(`
                    INSERT INTO spinix_settings (setting_key, setting_value, updated_at)
                    VALUES ($1, $2, CURRENT_TIMESTAMP)
                    ON CONFLICT (setting_key) 
                    DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP
                `, [`multiplier_${floor}`, numMultiplier.toString()]);
            }

            await client.query('COMMIT');

            res.json({
                success: true,
                message: '✅ تم تحديث المضاعفات بنجاح'
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/spinix/admin/stats/detailed', async (req, res) => {
    const { admin_id, period, limit, offset, user_id } = req.query;

    if (parseInt(admin_id) !== ADMIN_ID) {
        return res.status(403).json({
            success: false,
            error: 'Unauthorized - Admin only'
        });
    }

    const limitNum = parseInt(limit) || 20;
    const offsetNum = parseInt(offset) || 0;
    const periodType = period || 'daily';

    try {
        const generalStats = await pool.query(`
            SELECT 
                COUNT(*) as total_games,
                COUNT(CASE WHEN result = 'win' THEN 1 END) as total_wins,
                COUNT(CASE WHEN result = 'cashout' THEN 1 END) as total_cashouts,
                COUNT(CASE WHEN result = 'loss' THEN 1 END) as total_losses,
                COALESCE(SUM(bet_amount), 0) as total_bet_amount,
                COALESCE(SUM(profit), 0) as total_win_amount,
                COALESCE(SUM(CASE WHEN result = 'loss' THEN bet_amount ELSE 0 END), 0) as total_loss_amount,
                COUNT(DISTINCT user_id) as total_players
            FROM spinix_history
        `, []);

        let periodCondition = '';
        switch(periodType) {
            case 'daily': periodCondition = "DATE(played_at) = CURRENT_DATE"; break;
            case 'weekly': periodCondition = "DATE_PART('week', played_at) = DATE_PART('week', CURRENT_DATE) AND DATE_PART('year', played_at) = DATE_PART('year', CURRENT_DATE)"; break;
            case 'monthly': periodCondition = "DATE_TRUNC('month', played_at) = DATE_TRUNC('month', CURRENT_DATE)"; break;
            default: periodCondition = "1=1";
        }

        const periodStats = await pool.query(`
            SELECT 
                COUNT(*) as games,
                COUNT(CASE WHEN result = 'win' THEN 1 END) as wins,
                COUNT(CASE WHEN result = 'cashout' THEN 1 END) as cashouts,
                COUNT(CASE WHEN result = 'loss' THEN 1 END) as losses,
                COALESCE(SUM(bet_amount), 0) as bet_amount,
                COALESCE(SUM(profit), 0) as win_amount,
                COALESCE(SUM(CASE WHEN result = 'loss' THEN bet_amount ELSE 0 END), 0) as loss_amount,
                COUNT(DISTINCT user_id) as players
            FROM spinix_history
            WHERE ${periodCondition}
        `, []);

        let userFilter = user_id ? `WHERE user_id = $${user_id ? '1' : ''}` : '';
        let queryParams = [];
        
        let gamesQuery = `
            SELECT 
                id, user_id, bet_amount, final_floor, result, profit, final_multiplier, played_at
            FROM spinix_history
            ${userFilter}
            ORDER BY played_at DESC
            LIMIT $${user_id ? '2' : '1'} OFFSET $${user_id ? '3' : '2'}
        `;

        if (user_id) {
            queryParams = [user_id, limitNum, offsetNum];
        } else {
            queryParams = [limitNum, offsetNum];
        }

        const gamesResult = await pool.query(gamesQuery, queryParams);

        const gameIds = gamesResult.rows.map(g => g.id);
        let floorDetails = [];
        
        if (gameIds.length > 0) {
            const detailsResult = await pool.query(`
                SELECT * FROM spinix_game_details
                WHERE game_id = ANY($1)
                ORDER BY game_id, floor_number
            `, [gameIds]);
            floorDetails = detailsResult.rows;
        }

        const topPlayers = await pool.query(`
            SELECT 
                user_id,
                COUNT(*) as games,
                SUM(CASE WHEN result IN ('win', 'cashout') THEN profit ELSE 0 END) as total_profit,
                SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses,
                SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
                SUM(CASE WHEN result = 'cashout' THEN 1 ELSE 0 END) as cashouts
            FROM spinix_history
            GROUP BY user_id
            ORDER BY total_profit DESC
            LIMIT 10
        `, []);

        const multiplierStats = await pool.query(`
            SELECT 
                final_multiplier,
                COUNT(*) as count,
                SUM(profit) as total_profit
            FROM spinix_history
            WHERE result IN ('win', 'cashout')
            GROUP BY final_multiplier
            ORDER BY final_multiplier DESC
        `, []);

        res.json({
            success: true,
            stats: {
                general: {
                    total_games: parseInt(generalStats.rows[0]?.total_games || 0),
                    total_wins: parseInt(generalStats.rows[0]?.total_wins || 0),
                    total_cashouts: parseInt(generalStats.rows[0]?.total_cashouts || 0),
                    total_losses: parseInt(generalStats.rows[0]?.total_losses || 0),
                    total_bet_amount: parseFloat(generalStats.rows[0]?.total_bet_amount || 0),
                    total_win_amount: parseFloat(generalStats.rows[0]?.total_win_amount || 0),
                    total_loss_amount: parseFloat(generalStats.rows[0]?.total_loss_amount || 0),
                    total_players: parseInt(generalStats.rows[0]?.total_players || 0),
                    platform_profit: parseFloat(generalStats.rows[0]?.total_loss_amount || 0) - 
                                    parseFloat(generalStats.rows[0]?.total_win_amount || 0)
                },
                period: {
                    type: periodType,
                    games: parseInt(periodStats.rows[0]?.games || 0),
                    wins: parseInt(periodStats.rows[0]?.wins || 0),
                    cashouts: parseInt(periodStats.rows[0]?.cashouts || 0),
                    losses: parseInt(periodStats.rows[0]?.losses || 0),
                    bet_amount: parseFloat(periodStats.rows[0]?.bet_amount || 0),
                    win_amount: parseFloat(periodStats.rows[0]?.win_amount || 0),
                    loss_amount: parseFloat(periodStats.rows[0]?.loss_amount || 0),
                    players: parseInt(periodStats.rows[0]?.players || 0),
                    platform_profit: parseFloat(periodStats.rows[0]?.loss_amount || 0) - 
                                    parseFloat(periodStats.rows[0]?.win_amount || 0)
                },
                games: gamesResult.rows.map(game => ({
                    ...game,
                    floors: floorDetails.filter(d => d.game_id === game.id)
                })),
                top_players: topPlayers.rows,
                multiplier_stats: multiplierStats.rows,
                pagination: {
                    limit: limitNum,
                    offset: offsetNum
                }
            }
        });

    } catch (error) {
        console.error('❌ Detailed stats error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/spinix/admin/stats/summary', async (req, res) => {
    const { admin_id } = req.query;

    if (parseInt(admin_id) !== ADMIN_ID) {
        return res.status(403).json({
            success: false,
            error: 'Unauthorized - Admin only'
        });
    }

    try {
        const overall = await pool.query(`
            SELECT 
                COUNT(*) as total_games,
                COUNT(CASE WHEN result = 'win' THEN 1 END) as total_wins,
                COUNT(CASE WHEN result = 'cashout' THEN 1 END) as total_cashouts,
                COUNT(CASE WHEN result = 'loss' THEN 1 END) as total_losses,
                COUNT(CASE WHEN is_profit = true THEN 1 END) as profitable_games,
                COUNT(CASE WHEN is_profit = false THEN 1 END) as loss_games,
                COALESCE(SUM(CASE WHEN is_profit = true THEN profit ELSE 0 END), 0) as total_profit,
                COALESCE(SUM(CASE WHEN is_profit = false THEN bet_amount ELSE 0 END), 0) as total_loss,
                COALESCE(SUM(bet_amount), 0) as total_bet_amount,
                COALESCE(AVG(profit), 0) as avg_profit,
                COALESCE(MAX(profit), 0) as max_profit,
                COALESCE(MIN(profit), 0) as min_profit,
                COUNT(DISTINCT user_id) as unique_players
            FROM spinix_history
        `, []);

        const today = await pool.query(`
            SELECT 
                COUNT(*) as games,
                COUNT(CASE WHEN is_profit = true THEN 1 END) as wins,
                COUNT(CASE WHEN is_profit = false THEN 1 END) as losses,
                COALESCE(SUM(CASE WHEN is_profit = true THEN profit ELSE 0 END), 0) as profit,
                COALESCE(SUM(CASE WHEN is_profit = false THEN bet_amount ELSE 0 END), 0) as loss,
                COUNT(DISTINCT user_id) as players
            FROM spinix_history
            WHERE DATE(played_at) = CURRENT_DATE
        `, []);

        const week = await pool.query(`
            SELECT 
                COUNT(*) as games,
                COUNT(CASE WHEN is_profit = true THEN 1 END) as wins,
                COUNT(CASE WHEN is_profit = false THEN 1 END) as losses,
                COALESCE(SUM(CASE WHEN is_profit = true THEN profit ELSE 0 END), 0) as profit,
                COALESCE(SUM(CASE WHEN is_profit = false THEN bet_amount ELSE 0 END), 0) as loss,
                COUNT(DISTINCT user_id) as players
            FROM spinix_history
            WHERE played_at >= CURRENT_DATE - INTERVAL '7 days'
        `, []);

        const topPlayers = await pool.query(`
            SELECT 
                user_id,
                COUNT(*) as games,
                SUM(CASE WHEN is_profit = true THEN profit ELSE 0 END) as total_profit,
                SUM(CASE WHEN is_profit = false THEN bet_amount ELSE 0 END) as total_loss,
                COUNT(CASE WHEN result = 'win' THEN 1 END) as wins,
                COUNT(CASE WHEN result = 'cashout' THEN 1 END) as cashouts,
                COUNT(CASE WHEN result = 'loss' THEN 1 END) as losses
            FROM spinix_history
            GROUP BY user_id
            ORDER BY total_profit DESC
            LIMIT 10
        `, []);

        res.json({
            success: true,
            stats: {
                overall: {
                    total_games: parseInt(overall.rows[0]?.total_games || 0),
                    total_wins: parseInt(overall.rows[0]?.total_wins || 0),
                    total_cashouts: parseInt(overall.rows[0]?.total_cashouts || 0),
                    total_losses: parseInt(overall.rows[0]?.total_losses || 0),
                    profitable_games: parseInt(overall.rows[0]?.profitable_games || 0),
                    loss_games: parseInt(overall.rows[0]?.loss_games || 0),
                    total_profit: parseFloat(overall.rows[0]?.total_profit || 0),
                    total_loss: parseFloat(overall.rows[0]?.total_loss || 0),
                    total_bet_amount: parseFloat(overall.rows[0]?.total_bet_amount || 0),
                    avg_profit: parseFloat(overall.rows[0]?.avg_profit || 0),
                    max_profit: parseFloat(overall.rows[0]?.max_profit || 0),
                    min_profit: parseFloat(overall.rows[0]?.min_profit || 0),
                    unique_players: parseInt(overall.rows[0]?.unique_players || 0),
                    net_result: parseFloat(overall.rows[0]?.total_profit || 0) - 
                                parseFloat(overall.rows[0]?.total_loss || 0),
                    win_rate: overall.rows[0]?.total_games > 0 
                        ? ((parseInt(overall.rows[0]?.profitable_games || 0) / parseInt(overall.rows[0]?.total_games)) * 100).toFixed(2)
                        : 0
                },
                today: {
                    games: parseInt(today.rows[0]?.games || 0),
                    wins: parseInt(today.rows[0]?.wins || 0),
                    losses: parseInt(today.rows[0]?.losses || 0),
                    profit: parseFloat(today.rows[0]?.profit || 0),
                    loss: parseFloat(today.rows[0]?.loss || 0),
                    players: parseInt(today.rows[0]?.players || 0),
                    net_result: parseFloat(today.rows[0]?.profit || 0) - 
                                parseFloat(today.rows[0]?.loss || 0)
                },
                week: {
                    games: parseInt(week.rows[0]?.games || 0),
                    wins: parseInt(week.rows[0]?.wins || 0),
                    losses: parseInt(week.rows[0]?.losses || 0),
                    profit: parseFloat(week.rows[0]?.profit || 0),
                    loss: parseFloat(week.rows[0]?.loss || 0),
                    players: parseInt(week.rows[0]?.players || 0),
                    net_result: parseFloat(week.rows[0]?.profit || 0) - 
                                parseFloat(week.rows[0]?.loss || 0)
                },
                top_players: topPlayers.rows
            }
        });

    } catch (error) {
        console.error('❌ Stats summary error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/spinix/admin/stats/weekly', async (req, res) => {
    const { admin_id, weeks } = req.query;

    if (parseInt(admin_id) !== ADMIN_ID) {
        return res.status(403).json({
            success: false,
            error: 'Unauthorized - Admin only'
        });
    }

    const weeksCount = parseInt(weeks) || 4;

    try {
        const result = await pool.query(`
            SELECT 
                DATE_TRUNC('week', played_at) as week_start,
                COUNT(*) as games,
                COUNT(CASE WHEN result = 'win' THEN 1 END) as wins,
                COUNT(CASE WHEN result = 'cashout' THEN 1 END) as cashouts,
                COUNT(CASE WHEN result = 'loss' THEN 1 END) as losses,
                COALESCE(SUM(bet_amount), 0) as bet_amount,
                COALESCE(SUM(profit), 0) as win_amount,
                COALESCE(SUM(CASE WHEN result = 'loss' THEN bet_amount ELSE 0 END), 0) as loss_amount,
                COUNT(DISTINCT user_id) as players
            FROM spinix_history
            WHERE played_at >= CURRENT_DATE - INTERVAL '${weeksCount} weeks'
            GROUP BY DATE_TRUNC('week', played_at)
            ORDER BY week_start DESC
        `, []);

        const weeklyStats = result.rows.map(row => ({
            week_start: row.week_start,
            games: parseInt(row.games),
            wins: parseInt(row.wins),
            cashouts: parseInt(row.cashouts),
            losses: parseInt(row.losses),
            bet_amount: parseFloat(row.bet_amount),
            win_amount: parseFloat(row.win_amount),
            loss_amount: parseFloat(row.loss_amount),
            players: parseInt(row.players),
            platform_profit: parseFloat(row.loss_amount) - parseFloat(row.win_amount),
            win_rate: row.games > 0 ? ((row.wins / row.games) * 100).toFixed(2) : 0
        }));

        res.json({
            success: true,
            stats: weeklyStats
        });

    } catch (error) {
        console.error('❌ Weekly stats error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/spinix/admin/export', async (req, res) => {
    const { admin_id, format, start_date, end_date } = req.query;

    if (parseInt(admin_id) !== ADMIN_ID) {
        return res.status(403).json({
            success: false,
            error: 'Unauthorized - Admin only'
        });
    }

    try {
        let dateFilter = '';
        const params = [];
        
        if (start_date && end_date) {
            dateFilter = 'WHERE played_at BETWEEN $1 AND $2';
            params.push(start_date, end_date);
        }

        const query = `
            SELECT 
                h.id, h.user_id, h.bet_amount, h.final_floor, 
                h.result, h.profit, h.final_multiplier, h.played_at,
                COALESCE(
                    (SELECT COUNT(*) FROM spinix_game_details WHERE game_id = h.id),
                    0
                ) as total_floors,
                COALESCE(
                    (SELECT COUNT(*) FROM spinix_game_details WHERE game_id = h.id AND is_success = true),
                    0
                ) as successful_floors
            FROM spinix_history h
            ${dateFilter}
            ORDER BY h.played_at DESC
        `;

        const result = await pool.query(query, params);

        if (format === 'csv') {
            const csvRows = [
                ['ID', 'User ID', 'Bet Amount', 'Final Floor', 'Result', 'Profit', 'Multiplier', 'Date', 'Total Floors', 'Successful Floors']
            ];
            
            result.rows.forEach(row => {
                csvRows.push([
                    row.id, row.user_id, row.bet_amount, row.final_floor,
                    row.result, row.profit, row.final_multiplier, row.played_at,
                    row.total_floors, row.successful_floors
                ]);
            });

            const csv = csvRows.map(row => row.join(',')).join('\n');
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=spinix_games_${new Date().toISOString().split('T')[0]}.csv`);
            res.send(csv);
        } else {
            res.json({
                success: true,
                data: result.rows,
                count: result.rows.length
            });
        }

    } catch (error) {
        console.error('❌ Export error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ================================================================
//                      ===== تشغيل الخادم =====
// ================================================================

async function startServer() {
    console.log('\n🚀 ===== بدء تشغيل الخادم =====');
    console.log(`📡 المنفذ: ${port}`);
    console.log(`👑 المدير: ${ADMIN_ID}`);
    
    const ready = await ensureTables();
    dbReady = ready;
    
    app.listen(port, () => {
        console.log(`\n✅ الخادم يعمل على المنفذ ${port}`);
        console.log(`🔗 فحص الحالة: http://localhost:${port}/api/status`);
        console.log(`🔗 الجوائز النشطة: http://localhost:${port}/api/prizes`);
        console.log(`🔗 لوحة إدارة العجلة: http://localhost:${port}/api/admin/prizes?admin_id=${ADMIN_ID}`);
        console.log(`\n🎮 SPINIX:`);
        console.log(`   🔗 الحالة: http://localhost:${port}/api/spinix/status?user_id=123`);
        console.log(`   🔗 بدء جولة: POST http://localhost:${port}/api/spinix/start`);
        console.log(`   🔗 إدارة SPINIX: http://localhost:${port}/api/spinix/admin/settings?admin_id=${ADMIN_ID}`);
        console.log('\n📋 ===== جاهز! =====\n');
    });
}

startServer().catch(err => {
    console.error('❌ فشل تشغيل الخادم:', err);
    process.exit(1);
});
