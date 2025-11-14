import { createBot } from 'mineflayer';
import pkg from 'mineflayer-pathfinder';
const { pathfinder, goals } = pkg;
import { createLogger, format, transports } from 'winston';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// =================================================================================================
// Cấu hình Logger (Winston)
// =================================================================================================
const logger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        format.printf(info => {
            let emoji = '';
            switch (info.level.toUpperCase()) {
                case 'INFO':
                    emoji = '💬';
                    break;
                case 'WARN':
                    emoji = '⚠️';
                    break;
                case 'ERROR':
                    emoji = '❌';
                    break;
                default:
                    emoji = '📝';
                    break;
            }
            const cleanMessage = info.message.replace(/\*\*/g, '').replace(/__/g, '').trim();
            return `${info.timestamp} ${emoji} ${info.level.toUpperCase()}: ${cleanMessage}`;
        })
    ),
    transports: [
        new transports.Console({
            format: format.combine(
                format.colorize({
                    colors: {
                        info: 'green',
                        warn: 'yellow',
                        error: 'red',
                    }
                }),
                format.printf(info => info.message)
            )
        }),
    ]
});

// =================================================================================================
// Cấu hình cơ bản (Đọc từ config.json)
// =================================================================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.join(__dirname, 'config.json');

let config;
try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    logger.info('⚙️ CONFIG: Đã tải cấu hình từ config.json.');
} catch (error) {
    logger.error(`❌ LỖI CẤU HÌNH: Không thể tải cấu hình từ config.json: ${error.message}`);
    logger.error('⚠️ Vui lòng đảm bảo rằng tệp config.json tồn tại và có định dạng JSON hợp lệ.');
    process.exit(1);
}

// =================================================================================================
// Các biến trạng thái của bot
// =================================================================================================
let bot;
let afkTimeoutId = null;
let autoChatTimeoutId = null;
let reconnectTimeoutId = null;
let reconnectDelay = config.features.autoReconnect.delay;

// =================================================================================================
// Chức năng quản lý bot
// =================================================================================================
function generateRandomUsername(baseUsername, length) {
    const randomSuffix = Math.random().toString(36).substring(2, 2 + length);
    return `${baseUsername}${randomSuffix}`;
}

// Sửa đổi: Thêm tham số `forceChangeName`
function scheduleReconnect(reason, forceChangeName = false) {
    if (reconnectTimeoutId) {
        logger.info('ℹ️ KẾT NỐI LẠI: Đã có yêu cầu kết nối lại đang chờ xử lý. Bỏ qua yêu cầu hiện tại.');
        return;
    }

    stopBot();
    
    logger.error(`🔄 KẾT NỐI LẠI: Đang cố gắng kết nối lại sau ${reconnectDelay / 1000} giây do ${reason}...`);
    reconnectTimeoutId = setTimeout(() => {
        reconnectTimeoutId = null;
        // Sửa đổi: Truyền tham số `forceChangeName` vào hàm tạo bot
        createMinecraftBot(forceChangeName);
        reconnectDelay = Math.min(reconnectDelay * 2, config.features.autoReconnect.maxDelay);
    }, reconnectDelay);
}

function stopBot() {
    if (afkTimeoutId) clearTimeout(afkTimeoutId);
    if (autoChatTimeoutId) clearTimeout(autoChatTimeoutId);
    if (reconnectTimeoutId) clearTimeout(reconnectTimeoutId);
    if (bot) {
        bot.removeAllListeners();
        bot.end();
    }
    afkTimeoutId = null;
    autoChatTimeoutId = null;
    reconnectTimeoutId = null;
    reconnectDelay = config.features.autoReconnect.delay;
    bot = null;
}

function goToPosition() {
    if (!bot || !config.position.enabled) return;

    const { x, y, z } = config.position;
    if (!bot.pathfinder.isMoving()) {
        logger.info(`🚶 ĐI ĐẾN: Đang di chuyển đến vị trí (${x}, ${y}, ${z})...`);
        const goal = new goals.GoalBlock(x, y, z);
        bot.pathfinder.setGoal(goal);
    } else {
        logger.warn('⚠️ ĐI ĐẾN: Pathfinder đang bận. Bỏ qua yêu cầu di chuyển.');
    }
}

function doAfkAction() {
    if (!bot || !config.features.antiAfk.enabled) {
        logger.warn('Bỏ qua hành động AFK: Bot không tồn tại hoặc tính năng AFK đã bị tắt.');
        return;
    }

    const actions = config.features.antiAfk.actions;
    const possibleActions = Object.keys(actions).filter(action => actions[action]);

    if (possibleActions.length > 0) {
        const randomAction = possibleActions[Math.floor(Math.random() * possibleActions.length)];
        logger.info(`🏃 HÀNH ĐỘNG AFK: Đang thực hiện hành động AFK: ${randomAction}`);

        try {
            switch (randomAction) {
                // ... các case hành động giữ nguyên ...
                case 'jump':
                    bot.setControlState('jump', true);
                    bot.waitForTicks(5).then(() => bot.setControlState('jump', false));
                    break;
                case 'sneak':
                    bot.setControlState('sneak', !bot.getControlState('sneak'));
                    break;
                case 'lookAround':
                    bot.look(Math.random() * Math.PI * 2, Math.random() * Math.PI - (Math.PI / 2), true);
                    break;
                case 'swingArm':
                    bot.swingArm();
                    break;
                case 'switchHotbar':
                    const currentSlot = bot.inventory.selectedHotbarFrame;
                    let newSlot = Math.floor(Math.random() * 9);
                    if (newSlot === currentSlot) {
                        newSlot = (newSlot + 1) % 9;
                    }
                    logger.info(`🔄 HÀNH ĐỘNG AFK: Đang chuyển đổi hotbar từ slot ${currentSlot + 1} sang ${newSlot + 1}`);
                    bot.setQuickBarSlot(newSlot);
                    break;
                default:
                    logger.warn(`⚠️ HÀNH ĐỘNG AFK: Hành động không xác định: ${randomAction}`);
                    break;
            }
        } catch (actionError) {
            logger.error(`❌ LỖI HÀNH ĐỘNG AFK: Đã xảy ra lỗi khi thực hiện hành động ${randomAction}: ${actionError.message}`);
        }
    } else {
        logger.warn('⚠️ AFK: Tính năng chống AFK đã được bật nhưng không có hành động nào được chọn trong config.json.');
    }

    const randomInterval = Math.random() * (config.features.antiAfk.maxInterval - config.features.antiAfk.minInterval) + config.features.antiAfk.minInterval;
    afkTimeoutId = setTimeout(doAfkAction, randomInterval);
}

function setupAfkActions() {
    if (afkTimeoutId) clearTimeout(afkTimeoutId);
    if (config.features.antiAfk.enabled) {
        logger.info('🚶 AFK: Tính năng chống AFK đã được bật.');
        doAfkAction();
    } else {
        logger.info('😴 AFK: Tính năng chống AFK đã bị tắt.');
    }
}

function setupAutoChat() {
    if (autoChatTimeoutId) clearTimeout(autoChatTimeoutId);

    if (config.features.autoChat.enabled) {
        logger.info('💬 CHAT: Tính năng tự động chat đã được bật.');
        const chatFunc = () => {
            if (bot && bot.isOnline && config.features.autoChat.messages.length > 0) {
                const message = config.features.autoChat.messages[Math.floor(Math.random() * config.features.autoChat.messages.length)];
                bot.chat(message);
                logger.info(`🗣️ TỰ ĐỘNG CHAT: Đã gửi: "${message}"`);
            } else if (bot && bot.isOnline && config.features.autoChat.messages.length === 0) {
                logger.warn('⚠️ CHAT: Tính năng tự động chat đã được bật nhưng danh sách tin nhắn trống.');
            }
            autoChatTimeoutId = setTimeout(chatFunc, config.features.autoChat.interval);
        };
        chatFunc();
    } else {
        logger.info('🚫 CHAT: Tính năng tự động chat đã bị tắt.');
    }
}

// =================================================================================================
// Khởi tạo và quản lý bot
// =================================================================================================
// Sửa đổi: Thêm tham số `forceChangeName`
function createMinecraftBot(forceChangeName = false) {
    stopBot();
    
    let currentUsername = config.bot.baseUsername;
    // Sửa đổi: Thêm điều kiện `&& forceChangeName`
    if (config.features.randomUsernameOnKick.enabled && forceChangeName) {
        currentUsername = generateRandomUsername(config.bot.baseUsername, config.features.randomUsernameOnKick.length);
        logger.info(`🔄 TÊN NGƯỜI DÙNG: Bị kick, đổi tên thành "${currentUsername}".`);
    } else {
        logger.info(`🔄 TÊN NGƯỜI DÙNG: Giữ nguyên tên người dùng "${currentUsername}".`);
    }

    const botOptions = {
        host: config.server.host,
        port: config.server.port,
        username: currentUsername,
        password: config.bot.password || undefined,
        auth: config.server.auth,
        version: config.server.version,
        hideErrors: false
    };

    try {
        bot = createBot(botOptions);
    } catch (err) {
        logger.error(`❌ LỖI TẠO BOT: Không thể tạo instance bot: ${err.message}`);
        return; 
    }
    
    bot.loadPlugin(pathfinder);

    // =================================================================================================
    // Xử lý sự kiện của bot
    // =================================================================================================
    bot.on('spawn', () => {
        logger.info(`✅ BOT TRỰC TUYẾN: Đã kết nối thành công đến máy chủ ${config.server.host} (phiên bản: ${bot.version})!`);
        reconnectDelay = config.features.autoReconnect.delay;
        setupAfkActions();
        setupAutoChat();
        goToPosition();
    });
    
    bot.on('kicked', (reason) => {
        const displayReason = typeof reason === 'object' ? JSON.stringify(reason) : reason;
        logger.error(`💥 BOT BỊ KICK! Lý do: "${displayReason}"`);
        // Sửa đổi: Truyền `true` để buộc đổi tên
        if (config.features.autoReconnect.enabled) scheduleReconnect('bị_kick', true);
    });

    bot.on('end', (reason) => {
        logger.error(`💔 BOT ĐÃ NGẮT KẾT NỐI: Lý do: "${reason}"`);
        // Mặc định không đổi tên
        if (config.features.autoReconnect.enabled) scheduleReconnect('ngắt_kết_nối', false);
    });

    bot.on('error', (err) => {
        logger.error(`🐛 LỖI CHUNG CỦA BOT: ${err.message}`);
        // Lỗi không nhất thiết phải ngắt kết nối, nên không tự động kết nối lại ở đây
        // Nếu lỗi gây ra ngắt kết nối, sự kiện 'end' sẽ xử lý.
    });
    
    bot.on('messagestr', (message, messagePosition) => {
        if (messagePosition === 'chat' || messagePosition === 'system') {
            const lowerCaseMessage = message.toLowerCase();
            const password = config.bot.password;

            if (password && password.length > 0) {
                if (lowerCaseMessage.includes('register') && lowerCaseMessage.includes('password')) {
                    logger.info('🔐 AUTOLOGIN: Máy chủ yêu cầu đăng ký. Đang gửi lệnh /register...');
                    bot.chat(`/register ${password} ${password}`);
                } else if (lowerCaseMessage.includes('login') && lowerCaseMessage.includes('password')) {
                    logger.info('🔐 AUTOLOGIN: Máy chủ yêu cầu đăng nhập. Đang gửi lệnh /login...');
                    bot.chat(`/login ${password}`);
                }
            }
        }
    });
}

// Khởi động lần đầu, không đổi tên
createMinecraftBot(false);

// =================================================================================================
// Xử lý các lỗi không được xử lý để đảm bảo bot luôn kết nối lại
// =================================================================================================
process.on('unhandledRejection', (reason, promise) => {
    logger.error('❌ LỖI KHÔNG XỬ LÝ: Unhandled Rejection:', reason);
    // Mặc định không đổi tên
    if (config.features.autoReconnect.enabled) scheduleReconnect('unhandled_rejection', false);
});

process.on('uncaughtException', (err) => {
    logger.error('❌ LỖI KHÔNG XỬ LÝ: Uncaught Exception:', err);
    // Mặc định không đổi tên
    if (config.features.autoReconnect.enabled) scheduleReconnect('uncaught_exception', false);
});