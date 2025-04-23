// index.js (已添加详细日志)
import { extension_settings, loadExtensionSettings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types, getRequestHeaders } from "../../../../script.js"; // <-- Added getRequestHeaders

const extensionName = "hide-helper";
const defaultSettings = {
    // 保留全局默认设置用于向后兼容
    // 注意：hideLastN 和 lastAppliedSettings 现在将存储在角色/群组数据中，而不是这里
    enabled: true
};

// 缓存上下文
let cachedContext = null;

// DOM元素缓存
const domCache = {
    hideLastNInput: null,
    saveBtn: null,
    currentValueDisplay: null,
    // 初始化缓存
    init() {
        console.debug(`[${extensionName} DEBUG] Initializing DOM cache.`);
        this.hideLastNInput = document.getElementById('hide-last-n');
        this.saveBtn = document.getElementById('hide-save-settings-btn');
        this.currentValueDisplay = document.getElementById('hide-current-value');
        console.debug(`[${extensionName} DEBUG] DOM cache initialized:`, {
            hideLastNInput: !!this.hideLastNInput,
            saveBtn: !!this.saveBtn,
            currentValueDisplay: !!this.currentValueDisplay
        });
    }
};

// 获取优化的上下文
function getContextOptimized() {
    console.debug(`[${extensionName} DEBUG] Entering getContextOptimized.`);
    if (!cachedContext) {
        console.debug(`[${extensionName} DEBUG] Context cache miss. Calling getContext().`);
        cachedContext = getContext();
        console.debug(`[${extensionName} DEBUG] Context fetched:`, cachedContext ? `CharacterId: ${cachedContext.characterId}, GroupId: ${cachedContext.groupId}, Chat Length: ${cachedContext.chat?.length}` : 'null');
    } else {
        console.debug(`[${extensionName} DEBUG] Context cache hit.`);
    }
    return cachedContext;
}

// 初始化扩展设置 (仅包含全局启用状态)
function loadSettings() {
    console.log(`[${extensionName}] Entering loadSettings.`);
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0 || typeof extension_settings[extensionName].enabled === 'undefined') {
        console.log(`[${extensionName}] Initializing default settings.`);
        extension_settings[extensionName].enabled = defaultSettings.enabled;
    }
    console.log(`[${extensionName}] Settings loaded:`, extension_settings[extensionName]);
}

// 创建UI面板 - 修改为简化版本，只有开启/关闭选项
function createUI() {
    console.log(`[${extensionName}] Entering createUI.`);
    const settingsHtml = `
    <div id="hide-helper-settings" class="hide-helper-container">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>隐藏助手</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="hide-helper-section">
                    <!-- 开启/关闭选项 -->
                    <div class="hide-helper-toggle-row">
                        <span class="hide-helper-label">插件状态:</span>
                        <select id="hide-helper-toggle">
                            <option value="enabled">开启</option>
                            <option value="disabled">关闭</option>
                        </select>
                    </div>
                </div>
                <hr class="sysHR">
            </div>
        </div>
    </div>`;

    // 将UI添加到SillyTavern扩展设置区域
    console.log(`[${extensionName}] Appending settings UI to #extensions_settings.`);
    $("#extensions_settings").append(settingsHtml);

    // 创建聊天输入区旁边的按钮
    createInputWandButton();

    // 创建弹出对话框
    createPopup();

    // 设置事件监听器
    setupEventListeners();

    // 初始化DOM缓存
    console.log(`[${extensionName}] Scheduling DOM cache initialization.`);
    setTimeout(() => domCache.init(), 100);
    console.log(`[${extensionName}] Exiting createUI.`);
}

// 新增：创建输入区旁的按钮
function createInputWandButton() {
    console.log(`[${extensionName}] Entering createInputWandButton.`);
    const buttonHtml = `
    <div id="hide-helper-wand-button" class="list-group-item flex-container flexGap5" title="隐藏助手">
        <span style="padding-top: 2px;">
            <i class="fa-solid fa-ghost"></i>
        </span>
        <span>隐藏助手</span>
    </div>`;

    console.log(`[${extensionName}] Appending wand button to #data_bank_wand_container.`);
    $('#data_bank_wand_container').append(buttonHtml);
    console.log(`[${extensionName}] Exiting createInputWandButton.`);
}

// 新增：创建弹出对话框
function createPopup() {
    console.log(`[${extensionName}] Entering createPopup.`);
    const popupHtml = `
    <div id="hide-helper-popup" class="hide-helper-popup">
        <div class="hide-helper-popup-title">隐藏助手设置</div>

        <!-- 输入行 - 保存设置按钮 + 输入框 + 取消隐藏按钮 -->
        <div class="hide-helper-input-row">
            <button id="hide-save-settings-btn" class="hide-helper-btn">保存设置</button>
            <input type="number" id="hide-last-n" min="0" placeholder="隐藏最近N楼之前的消息">
            <button id="hide-unhide-all-btn" class="hide-helper-btn">取消隐藏</button>
        </div>

        <!-- 当前隐藏设置 -->
        <div class="hide-helper-current">
            <strong>当前隐藏设置:</strong> <span id="hide-current-value">无</span>
        </div>

        <!-- 底部关闭按钮 -->
        <div class="hide-helper-popup-footer">
            <button id="hide-helper-popup-close" class="hide-helper-close-btn">关闭</button>
        </div>
    </div>`;

    console.log(`[${extensionName}] Appending popup HTML to body.`);
    $('body').append(popupHtml);
    console.log(`[${extensionName}] Exiting createPopup.`);
}

// 获取当前角色/群组的隐藏设置 (从角色/群组数据读取)
function getCurrentHideSettings() {
    console.debug(`[${extensionName} DEBUG] Entering getCurrentHideSettings.`);
    const context = getContextOptimized();
    if (!context) {
        console.warn(`[${extensionName} DEBUG] getCurrentHideSettings: Context not available.`);
        return null;
    }

    const isGroup = !!context.groupId;
    let target = null;
    let settings = null;

    if (isGroup) {
        console.debug(`[${extensionName} DEBUG] getCurrentHideSettings: Trying to find group with ID: ${context.groupId}`);
        // 确保 groups 数组存在
        target = context.groups?.find(x => x.id == context.groupId);
        if (target) {
            // 从 group.data 读取
            settings = target?.data?.hideHelperSettings || null;
            console.debug(`[${extensionName} DEBUG] getCurrentHideSettings: Found group. Settings from group.data:`, settings);
        } else {
            console.warn(`[${extensionName} DEBUG] getCurrentHideSettings: Group ${context.groupId} not found in context.groups.`);
        }
    } else {
        console.debug(`[${extensionName} DEBUG] getCurrentHideSettings: Trying to find character with ID (index): ${context.characterId}`);
        // 确保 characters 数组和 characterId 存在且有效
        if (context.characters && context.characterId !== undefined && context.characterId >= 0 && context.characterId < context.characters.length) {
           target = context.characters[context.characterId];
           if (target) {
               // 从 character.data.extensions 读取 (遵循 V2 卡片规范)
               settings = target?.data?.extensions?.hideHelperSettings || null;
               console.debug(`[${extensionName} DEBUG] getCurrentHideSettings: Found character ${target.name}. Settings from character.data.extensions:`, settings);
           } else {
               console.warn(`[${extensionName} DEBUG] getCurrentHideSettings: Character object at index ${context.characterId} is invalid.`);
           }
        } else {
            console.warn(`[${extensionName} DEBUG] getCurrentHideSettings: Character context invalid (characters array missing, or index out of bounds: ${context.characterId})`);
        }
    }

    console.debug(`[${extensionName} DEBUG] Exiting getCurrentHideSettings, returning:`, settings);
    return settings; // 如果找不到目标或数据，返回 null
}


// 保存当前角色/群组的隐藏设置 (通过API持久化)
async function saveCurrentHideSettings(hideLastN) {
    console.log(`[${extensionName}] Entering saveCurrentHideSettings with hideLastN: ${hideLastN}`);
    const context = getContextOptimized();
    if (!context) {
        console.error(`[${extensionName}] Cannot save settings: Context not available.`);
        return false;
    }
    const isGroup = !!context.groupId;
    const chatLength = context.chat?.length || 0; // 在获取目标前计算，避免目标不存在时出错
    console.log(`[${extensionName}] saveCurrentHideSettings: isGroup=${isGroup}, currentChatLength=${chatLength}`);

    const settingsToSave = {
        hideLastN: hideLastN >= 0 ? hideLastN : 0, // 确保非负
        lastProcessedLength: chatLength,
        userConfigured: true // 明确标记用户已配置
    };
    console.log(`[${extensionName}] saveCurrentHideSettings: Settings object to save:`, settingsToSave);

    if (isGroup) {
        const groupId = context.groupId;
        console.log(`[${extensionName}] saveCurrentHideSettings: Saving for Group ID: ${groupId}`);
        // 确保 groups 数组存在
        const group = context.groups?.find(x => x.id == groupId);
        if (!group) {
             console.error(`[${extensionName}] Cannot save settings: Group ${groupId} not found in context.`);
             return false;
        }

        // 1. (可选) 修改内存对象 (用于即时反馈, 但API保存才是关键)
        group.data = group.data || {};
        group.data.hideHelperSettings = settingsToSave;
        console.log(`[${extensionName}] saveCurrentHideSettings: Updated group object in memory (before API call):`, group);

        // 2. 持久化 (发送API请求)
        try {
             // 构造发送给 /api/groups/edit 的完整群组对象
             const payload = {
                 ...group, // 包含ID和其他所有现有字段
                 data: { // 合并或覆盖 data 字段
                     ...(group.data || {}), // 保留 data 中其他可能存在的字段
                     hideHelperSettings: settingsToSave // 添加或更新我们的设置
                 }
             };

            console.log(`[${extensionName}] Saving group settings via /api/groups/edit for ${groupId}. Payload:`, JSON.stringify(payload)); // 调试日志
            const response = await fetch('/api/groups/edit', {
                method: 'POST',
                headers: getRequestHeaders(), // 使用 SillyTavern 的辅助函数获取请求头
                body: JSON.stringify(payload) // 发送整个更新后的群组对象
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[${extensionName}] Failed to save group settings for ${groupId}: ${response.status} ${errorText}`);
                toastr.error(`保存群组设置失败: ${errorText}`);
                return false;
            }
            console.log(`[${extensionName}] Group settings saved successfully via API for ${groupId}`);
            return true;
        } catch (error) {
            console.error(`[${extensionName}] Error during fetch to save group settings for ${groupId}:`, error);
            toastr.error(`保存群组设置时发生网络错误: ${error.message}`);
            return false;
        }

    } else { // 是角色
        console.log(`[${extensionName}] saveCurrentHideSettings: Saving for Character ID (index): ${context.characterId}`);
        // 确保 characters 数组和 characterId 存在且有效
        if (!context.characters || context.characterId === undefined || context.characterId < 0 || context.characterId >= context.characters.length) {
             console.error(`[${extensionName}] Cannot save settings: Character context is invalid.`);
             return false;
        }
        const characterId = context.characterId; // 这是索引
        const character = context.characters[characterId];
        if (!character || !character.avatar) {
            console.error(`[${extensionName}] Cannot save settings: Character or character avatar not found at index ${characterId}.`);
            return false;
        }
        const avatarFileName = character.avatar; // 获取头像文件名作为唯一标识
        console.log(`[${extensionName}] saveCurrentHideSettings: Target character avatar: ${avatarFileName}`);

        // 1. (可选) 修改内存对象
        character.data = character.data || {};
        character.data.extensions = character.data.extensions || {}; // 确保 extensions 对象存在
        character.data.extensions.hideHelperSettings = settingsToSave;
        console.log(`[${extensionName}] saveCurrentHideSettings: Updated character object in memory (before API call):`, character);

        // 2. 持久化 (调用 /api/characters/merge-attributes)
        try {
            // 构造发送给 /api/characters/merge-attributes 的部分数据
            const payload = {
                avatar: avatarFileName, // API 需要知道是哪个角色
                data: { // 只发送需要更新/合并的部分
                    extensions: {
                        hideHelperSettings: settingsToSave
                    }
                }
                // 注意：merge-attributes 会深层合并，所以这样只会更新 hideHelperSettings
            };

            console.log(`[${extensionName}] Saving character settings via /api/characters/merge-attributes for ${avatarFileName}. Payload:`, JSON.stringify(payload)); // 调试日志
            const response = await fetch('/api/characters/merge-attributes', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[${extensionName}] Failed to save character settings for ${avatarFileName}: ${response.status} ${errorText}`);
                toastr.error(`保存角色设置失败: ${errorText}`);
                return false;
            }
            console.log(`[${extensionName}] Character settings saved successfully via API for ${avatarFileName}`);
            return true;
        } catch (error) {
            console.error(`[${extensionName}] Error during fetch to save character settings for ${avatarFileName}:`, error);
            toastr.error(`保存角色设置时发生网络错误: ${error.message}`);
            return false;
        }
    }
}

// 更新当前设置显示 - 优化使用DOM缓存
function updateCurrentHideSettingsDisplay() {
    console.debug(`[${extensionName} DEBUG] Entering updateCurrentHideSettingsDisplay.`);
    const currentSettings = getCurrentHideSettings();
    console.debug(`[${extensionName} DEBUG] updateCurrentHideSettingsDisplay: Read settings:`, currentSettings);

    if (!domCache.currentValueDisplay) {
        console.debug(`[${extensionName} DEBUG] updateCurrentHideSettingsDisplay: DOM cache for currentValueDisplay not ready, initializing.`);
        domCache.init(); // Try initializing if not ready
        if (!domCache.currentValueDisplay) {
            console.warn(`[${extensionName} DEBUG] updateCurrentHideSettingsDisplay: currentValueDisplay element still not found after init. Aborting update.`);
            return; // Abort if still not found
        }
    }

    const displayValue = (currentSettings && currentSettings.hideLastN > 0) ? currentSettings.hideLastN : '无';
    console.debug(`[${extensionName} DEBUG] updateCurrentHideSettingsDisplay: Setting display text to: "${displayValue}"`);
    domCache.currentValueDisplay.textContent = displayValue;

    if (domCache.hideLastNInput) {
        const inputValue = currentSettings?.hideLastN > 0 ? currentSettings.hideLastN : '';
        console.debug(`[${extensionName} DEBUG] updateCurrentHideSettingsDisplay: Setting input value to: "${inputValue}"`);
        domCache.hideLastNInput.value = inputValue;
    } else {
        console.debug(`[${extensionName} DEBUG] updateCurrentHideSettingsDisplay: hideLastNInput element not in cache.`);
    }
    console.debug(`[${extensionName} DEBUG] Exiting updateCurrentHideSettingsDisplay.`);
}

// 防抖函数
function debounce(fn, delay) {
    let timer;
    return function(...args) {
        console.debug(`[${extensionName} DEBUG] Debounce: Clearing timer for ${fn.name}.`);
        clearTimeout(timer);
        console.debug(`[${extensionName} DEBUG] Debounce: Setting timer for ${fn.name} with delay ${delay}ms.`);
        timer = setTimeout(() => {
            console.debug(`[${extensionName} DEBUG] Debounce: Executing debounced function ${fn.name}.`);
            fn.apply(this, args);
        }, delay);
    };
}

// 防抖版本的全量检查
const runFullHideCheckDebounced = debounce(runFullHideCheck, 200);

/**
 * 检查是否应该执行隐藏/取消隐藏操作
 * 只有当用户明确设置过隐藏规则并且插件启用时才返回true
 */
function shouldProcessHiding() {
    console.debug(`[${extensionName} DEBUG] Entering shouldProcessHiding.`);
    // 检查插件是否启用
    if (!extension_settings[extensionName].enabled) {
        console.debug(`[${extensionName} DEBUG] shouldProcessHiding: Plugin is disabled globally. Returning false.`);
        return false;
    }

    const settings = getCurrentHideSettings();
    console.debug(`[${extensionName} DEBUG] shouldProcessHiding: Read settings:`, settings);
    // 如果没有设置，或者用户没有明确配置过，则不处理
    if (!settings || settings.userConfigured !== true) {
        console.debug(`[${extensionName} DEBUG] shouldProcessHiding: No user-configured settings found or settings object missing. Returning false.`);
        return false;
    }
    console.debug(`[${extensionName} DEBUG] shouldProcessHiding: Plugin enabled and user configured settings found. Returning true.`);
    return true;
}

/**
 * 增量隐藏检查 (用于新消息到达)
 * 仅处理从上次处理长度到现在新增的、需要隐藏的消息
 */
async function runIncrementalHideCheck() { // 改为 async 以便调用 saveCurrentHideSettings
    console.debug(`[${extensionName} DEBUG] Entering runIncrementalHideCheck.`);
    // 首先检查是否应该执行隐藏操作
    if (!shouldProcessHiding()) {
        console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: shouldProcessHiding returned false. Skipping.`);
        return;
    }

    const startTime = performance.now();
    const context = getContextOptimized();
    if (!context || !context.chat) {
        console.warn(`[${extensionName} DEBUG] runIncrementalHideCheck: Aborted. Context or chat data not available.`);
        return;
    }

    const chat = context.chat;
    const currentChatLength = chat.length;
    const settings = getCurrentHideSettings() || { hideLastN: 0, lastProcessedLength: 0, userConfigured: false }; // 提供默认值
    const { hideLastN, lastProcessedLength = 0 } = settings; // 从 settings 解构
    console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: currentChatLength=${currentChatLength}, hideLastN=${hideLastN}, lastProcessedLength=${lastProcessedLength}`);

    // --- 前置条件检查 ---
    if (currentChatLength === 0 || hideLastN <= 0) {
        console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: Condition met (currentChatLength === 0 || hideLastN <= 0). Checking if length needs saving.`);
        if (currentChatLength !== lastProcessedLength && settings.userConfigured) { // 只有当用户配置过且长度变化时才更新长度
            console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: Length changed (${lastProcessedLength} -> ${currentChatLength}) with hideLastN <= 0. Saving settings.`);
            await saveCurrentHideSettings(hideLastN); // 使用 await 调用异步函数
        } else {
             console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: Length did not change or not user configured. Skipping save.`);
        }
        console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: Skipping main logic due to condition.`);
        return;
    }

    if (currentChatLength <= lastProcessedLength) {
        // 长度未增加或减少，说明可能发生删除或其他异常，应由 Full Check 处理
        console.warn(`[${extensionName} DEBUG] runIncrementalHideCheck: Skipped. Chat length did not increase or decreased (${lastProcessedLength} -> ${currentChatLength}). Possibly a delete or unexpected state.`);
        // 重要：如果长度减少了，也需要更新 lastProcessedLength 以免下次增量计算错误
         if (currentChatLength < lastProcessedLength && settings.userConfigured) {
            console.warn(`[${extensionName} DEBUG] runIncrementalHideCheck: Chat length decreased. Saving settings with new length.`);
            await saveCurrentHideSettings(hideLastN); // 保存当前hideLastN和新的chatLength
         }
        return;
    }

    // --- 计算范围 ---
    const targetVisibleStart = Math.max(0, currentChatLength - hideLastN);
    const previousVisibleStart = lastProcessedLength > 0 ? Math.max(0, lastProcessedLength - hideLastN) : 0; // 处理首次的情况并确保非负
    console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: Calculated visible range: targetVisibleStart=${targetVisibleStart}, previousVisibleStart=${previousVisibleStart}`);

    // 必须目标 > 先前才有新增隐藏
    if (targetVisibleStart > previousVisibleStart) {
        const toHideIncrementally = [];
        const startIndex = previousVisibleStart; // 直接使用计算好的 previousVisibleStart
        const endIndex = targetVisibleStart; // 结束索引是新的可见起始点（不包含）
        console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: Need to check messages in range [${startIndex}, ${endIndex}).`);

        // --- 收集需要隐藏的消息 ---
        for (let i = startIndex; i < endIndex; i++) {
            // 允许隐藏用户消息，只检查 is_system === false (更正：应该检查 is_system 是否已经是 true)
            // 修正逻辑：我们应该隐藏索引 i 的消息，只要它当前不是系统消息
            if (chat[i] && chat[i].is_system !== true) {
                toHideIncrementally.push(i);
                 console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: Adding message ${i} to incremental hide list.`);
            } else {
                 console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: Skipping message ${i} (already system or missing).`);
            }
        }

        // --- 执行批量更新 ---
        if (toHideIncrementally.length > 0) {
            console.log(`[${extensionName}] Incrementally hiding messages: Indices [${toHideIncrementally.join(', ')}]`);

            // 1. 批量更新数据 (chat 数组)
            console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: Updating chat array data...`);
            toHideIncrementally.forEach(idx => { if (chat[idx]) chat[idx].is_system = true; });
            console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: Chat array data updated.`);

            // 2. 批量更新 DOM
            try {
                console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: Updating DOM elements...`);
                // 使用属性选择器
                const hideSelector = toHideIncrementally.map(id => `.mes[mesid="${id}"]`).join(','); // DOM 选择器需要 .mes
                if (hideSelector) {
                    console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: Applying selector: ${hideSelector}`);
                    $(hideSelector).attr('is_system', 'true');
                    console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: DOM update command issued.`);
                } else {
                    console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: No DOM elements to update.`);
                }
            } catch (error) {
                console.error(`[${extensionName}] Error updating DOM incrementally:`, error);
            }

            // 3. 延迟保存 Chat (包含 is_system 的修改) - SillyTavern 通常有自己的保存机制，这里可能不需要
            // console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: Skipping explicit chat save.`);

            // 4. 更新处理长度并保存设置（重要：现在需要 await）
            console.log(`[${extensionName}] runIncrementalHideCheck: Saving settings after incremental hide.`);
            await saveCurrentHideSettings(hideLastN); // 在这里保存更新后的 lastProcessedLength

        } else {
             console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: No messages needed hiding in the new range [${startIndex}, ${endIndex}).`);
             // 即使没有隐藏，如果长度变了，也需要更新设置中的 lastProcessedLength
             if (settings.lastProcessedLength !== currentChatLength && settings.userConfigured) {
                 console.log(`[${extensionName}] runIncrementalHideCheck: Length changed but no messages hidden. Saving settings.`);
                 await saveCurrentHideSettings(hideLastN);
             } else {
                  console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: Length did not change or not user configured. Skipping save.`);
             }
        }
    } else {
        console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: Visible start did not advance or range invalid (targetVisibleStart <= previousVisibleStart).`);
        // 即使没有隐藏，如果长度变了，也需要更新设置中的 lastProcessedLength
         if (settings.lastProcessedLength !== currentChatLength && settings.userConfigured) {
             console.log(`[${extensionName}] runIncrementalHideCheck: Length changed but visible start didn't advance. Saving settings.`);
             await saveCurrentHideSettings(hideLastN);
         } else {
              console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: Length did not change or not user configured. Skipping save.`);
         }
    }

    console.debug(`[${extensionName} DEBUG] Incremental check completed in ${performance.now() - startTime}ms`);
}

/**
 * 全量隐藏检查 (优化的差异更新)
 * 用于加载、切换、删除、设置更改等情况
 */
async function runFullHideCheck() { // 改为 async 以便调用 saveCurrentHideSettings
    console.log(`[${extensionName}] Entering runFullHideCheck.`);
    // 首先检查是否应该执行隐藏操作
    if (!shouldProcessHiding()) {
        console.log(`[${extensionName}] runFullHideCheck: shouldProcessHiding returned false. Skipping.`);
        return;
    }

    const startTime = performance.now();
    const context = getContextOptimized();
    if (!context || !context.chat) {
        console.warn(`[${extensionName}] runFullHideCheck: Aborted. Context or chat data not available.`);
        return;
    }
    const chat = context.chat;
    const currentChatLength = chat.length;
    console.log(`[${extensionName}] runFullHideCheck: Context OK. Chat length: ${currentChatLength}`);

    // 加载当前角色的设置
    const settings = getCurrentHideSettings() || { hideLastN: 0, lastProcessedLength: 0, userConfigured: false };
    const { hideLastN } = settings; // 解构 hideLastN
    console.log(`[${extensionName}] runFullHideCheck: Loaded settings for current entity: hideLastN=${hideLastN}, userConfigured=${settings.userConfigured}`);

    // 1. 计算可见边界
    const visibleStart = hideLastN <= 0
        ? 0                                         // 不隐藏任何消息
        : (hideLastN >= currentChatLength
            ? 0                                     // 如果 N >= 长度，也相当于不隐藏
            : Math.max(0, currentChatLength - hideLastN)); // 正常计算，确保非负
    console.log(`[${extensionName}] runFullHideCheck: Calculated visibleStart index: ${visibleStart}`);


    // 2. 差异计算和数据更新阶段
    const toHide = [];
    const toShow = [];
    let changed = false;
    console.log(`[${extensionName}] runFullHideCheck: Starting diff calculation...`);

    for (let i = 0; i < currentChatLength; i++) {
        const msg = chat[i];
        if (!msg) {
            console.warn(`[${extensionName} DEBUG] runFullHideCheck: Skipping empty message slot at index ${i}.`);
            continue; // 跳过空消息槽
        }

        const isCurrentlyHidden = msg.is_system === true;
        const shouldBeHidden = i < visibleStart; // 索引小于 visibleStart 的应该隐藏

        // console.debug(`[${extensionName} DEBUG] runFullHideCheck: Index ${i}: isCurrentlyHidden=${isCurrentlyHidden}, shouldBeHidden=${shouldBeHidden}`);

        if (shouldBeHidden && !isCurrentlyHidden) {
             console.debug(`[${extensionName} DEBUG] runFullHideCheck: Index ${i} should be hidden but isn't. Marking to hide.`);
            msg.is_system = true;
            toHide.push(i);
            changed = true;
        } else if (!shouldBeHidden && isCurrentlyHidden) {
             console.debug(`[${extensionName} DEBUG] runFullHideCheck: Index ${i} should be shown but is hidden. Marking to show.`);
            msg.is_system = false;
            toShow.push(i);
            changed = true;
        }
    }
    console.log(`[${extensionName}] runFullHideCheck: Diff calculation done. Changes needed: ${changed}. To hide: ${toHide.length}, To show: ${toShow.length}.`);

    // 3. 只有在有更改时才执行DOM更新
    if (changed) {
        try {
            console.log(`[${extensionName}] runFullHideCheck: Applying DOM updates...`);
            // 批量处理隐藏消息
            if (toHide.length > 0) {
                const hideSelector = toHide.map(id => `.mes[mesid="${id}"]`).join(',');
                if (hideSelector) {
                    console.debug(`[${extensionName} DEBUG] runFullHideCheck: Hiding DOM elements with selector: ${hideSelector}`);
                    $(hideSelector).attr('is_system', 'true');
                }
            }

            // 批量处理显示消息
            if (toShow.length > 0) {
                const showSelector = toShow.map(id => `.mes[mesid="${id}"]`).join(',');
                if (showSelector) {
                    console.debug(`[${extensionName} DEBUG] runFullHideCheck: Showing DOM elements with selector: ${showSelector}`);
                    $(showSelector).attr('is_system', 'false');
                }
            }
             console.log(`[${extensionName}] runFullHideCheck: DOM updates applied.`);
        } catch (error) {
            console.error(`[${extensionName}] Error updating DOM in full check:`, error);
        }
    } else {
         console.log(`[${extensionName}] runFullHideCheck: No changes needed in chat data or DOM based on current settings.`);
    }

    // 4. 更新处理长度并保存设置（如果长度变化且用户已配置）
    console.log(`[${extensionName}] runFullHideCheck: Checking if settings need saving. lastProcessedLength=${settings.lastProcessedLength}, currentChatLength=${currentChatLength}, userConfigured=${settings.userConfigured}`);
    if (settings.lastProcessedLength !== currentChatLength && settings.userConfigured) {
        console.log(`[${extensionName}] runFullHideCheck: Length changed (${settings.lastProcessedLength} -> ${currentChatLength}) and user configured. Saving settings.`);
        await saveCurrentHideSettings(hideLastN); // 使用 await
    } else {
         console.log(`[${extensionName}] runFullHideCheck: Settings save not required (length unchanged or not user configured).`);
    }
    console.log(`[${extensionName}] Full check completed in ${performance.now() - startTime}ms`);
}

// 新增：全部取消隐藏功能
async function unhideAllMessages() { // 改为 async
    const startTime = performance.now();
    console.log(`[${extensionName}] Entering unhideAllMessages.`);
    const context = getContextOptimized();
    if (!context || !context.chat) {
         console.warn(`[${extensionName}] Unhide all aborted: Chat data not available.`);
         // 尝试重置设置即使聊天不可用
         console.log(`[${extensionName}] Unhide all: Attempting to reset hide settings to 0 even though chat is unavailable.`);
         await saveCurrentHideSettings(0);
         updateCurrentHideSettingsDisplay(); // 更新UI显示
         return;
    }
    const chat = context.chat;
    const chatLength = chat.length;
    console.log(`[${extensionName}] Unhide all: Chat length is ${chatLength}.`);

    if (chatLength === 0) {
        console.log(`[${extensionName}] Unhide all: Chat is empty.`);
        // 即使聊天为空，也要确保设置被重置为 0
        console.log(`[${extensionName}] Unhide all: Saving hide setting as 0.`);
        await saveCurrentHideSettings(0);
        updateCurrentHideSettingsDisplay(); // 更新UI显示
        return;
    }

    // 找出所有当前是系统消息（可能被隐藏）的消息
    const toShow = [];
    console.log(`[${extensionName}] Unhide all: Scanning chat for hidden messages...`);
    for (let i = 0; i < chatLength; i++) {
        // 检查消息是否存在以及 is_system 是否为 true
        if (chat[i] && chat[i].is_system === true) {
            console.debug(`[${extensionName} DEBUG] Unhide all: Found hidden message at index ${i}. Marking to show.`);
            toShow.push(i);
        }
    }
    console.log(`[${extensionName}] Unhide all: Found ${toShow.length} messages to unhide.`);

    // 批量更新数据和DOM
    if (toShow.length > 0) {
        // 更新数据
        console.log(`[${extensionName}] Unhide all: Updating chat array data...`);
        toShow.forEach(idx => { if (chat[idx]) chat[idx].is_system = false; });
        console.log(`[${extensionName}] Unhide all: Chat data updated.`);

        // 更新DOM
        try {
            console.log(`[${extensionName}] Unhide all: Updating DOM...`);
            const showSelector = toShow.map(id => `.mes[mesid="${id}"]`).join(',');
            if (showSelector) {
                 console.debug(`[${extensionName} DEBUG] Unhide all: Applying selector: ${showSelector}`);
                 $(showSelector).attr('is_system', 'false');
                 console.log(`[${extensionName}] Unhide all: DOM updated.`);
            }
        } catch (error) {
            console.error(`[${extensionName}] Error updating DOM when unhiding all:`, error);
        }

        // 保存聊天 - 确认是否必要 (可能不需要，SillyTavern会自己处理)
        // console.log(`[${extensionName}] Unhide all: Skipping explicit chat save.`);
    } else {
        console.log(`[${extensionName}] Unhide all: No hidden messages found to change.`);
    }

    // 重要修改：重置隐藏设置为0，并通过 API 保存
    console.log(`[${extensionName}] Unhide all: Saving hide setting as 0.`);
    const success = await saveCurrentHideSettings(0);
    if (success) {
        console.log(`[${extensionName}] Unhide all: Hide setting successfully reset to 0.`);
        updateCurrentHideSettingsDisplay(); // 只有保存成功才更新显示
    } else {
        console.error(`[${extensionName}] Unhide all: Failed to reset hide setting to 0.`);
        toastr.error("无法重置隐藏设置。");
    }
     console.log(`[${extensionName}] Unhide all completed in ${performance.now() - startTime}ms`);
}

// 设置UI元素的事件监听器
function setupEventListeners() {
    console.log(`[${extensionName}] Entering setupEventListeners.`);

    // 设置弹出对话框按钮事件
    console.log(`[${extensionName}] Setting up click listener for #hide-helper-wand-button.`);
    $('#hide-helper-wand-button').on('click', function() {
        console.log(`[${extensionName}] Wand button clicked.`);
        if (!extension_settings[extensionName].enabled) {
            console.warn(`[${extensionName}] Wand button clicked but extension is disabled.`);
            toastr.warning('隐藏助手当前已禁用，请在扩展设置中启用。');
            return;
        }
        console.log(`[${extensionName}] Wand button: Extension enabled. Updating display before showing popup.`);
        updateCurrentHideSettingsDisplay(); // Update display values before showing

        const $popup = $('#hide-helper-popup');
        console.log(`[${extensionName}] Wand button: Displaying popup.`);
        $popup.css({ // 先设置基本样式，位置稍后计算
            'display': 'block',
            'visibility': 'hidden',
            'position': 'fixed',
            'left': '50%',
            'transform': 'translateX(-50%)'
        });

        // 确保弹出框内容渲染完成再计算位置
        setTimeout(() => {
            console.debug(`[${extensionName} DEBUG] Wand button: Calculating popup position.`);
            const popupHeight = $popup.outerHeight();
            const windowHeight = $(window).height();
            const topPosition = Math.max(10, Math.min((windowHeight - popupHeight) / 2, windowHeight - popupHeight - 50)); // 距底部至少50px
             console.debug(`[${extensionName} DEBUG] Wand button: Calculated topPosition: ${topPosition}px. Making popup visible.`);
            $popup.css({
                'top': topPosition + 'px',
                'visibility': 'visible'
            });
        }, 0); // 使用 setTimeout 0 延迟执行
    });

    // 弹出框关闭按钮事件
    console.log(`[${extensionName}] Setting up click listener for #hide-helper-popup-close.`);
    $('#hide-helper-popup-close').on('click', function() {
        console.log(`[${extensionName}] Popup close button clicked.`);
        $('#hide-helper-popup').hide();
    });

    // 设置选项更改事件 (全局启用/禁用)
    console.log(`[${extensionName}] Setting up change listener for #hide-helper-toggle.`);
    $('#hide-helper-toggle').on('change', function() {
        const isEnabled = $(this).val() === 'enabled';
        console.log(`[${extensionName}] Global toggle changed. New state: ${isEnabled ? 'enabled' : 'disabled'}`);
        extension_settings[extensionName].enabled = isEnabled;
        console.log(`[${extensionName}] Saving global settings due to toggle change.`);
        saveSettingsDebounced(); // 保存全局设置

        if (isEnabled) {
            console.log(`[${extensionName}] Extension enabled via toggle. Running full check.`);
            toastr.success('隐藏助手已启用');
            // 启用时，执行一次全量检查来应用当前角色的隐藏状态
            runFullHideCheckDebounced();
        } else {
            console.log(`[${extensionName}] Extension disabled via toggle.`);
            toastr.warning('隐藏助手已禁用');
            // 禁用时，不自动取消隐藏，保留状态 (可以选择在这里运行 unhideAllMessages 来取消隐藏)
            // console.log(`[${extensionName}] Optional: Consider running unhideAllMessages() here if disable should always unhide.`);
        }
    });

    const hideLastNInput = document.getElementById('hide-last-n');

    if (hideLastNInput) {
        console.log(`[${extensionName}] Setting up input listener for #hide-last-n.`);
        // 监听输入变化，确保非负
        hideLastNInput.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
             console.debug(`[${extensionName} DEBUG] Input field changed. Raw value: "${e.target.value}", Parsed value: ${value}`);
            // 如果输入无效或小于0，则清空或设为0 (根据偏好选择，这里选择清空)
            if (isNaN(value) || value < 0) {
                 console.debug(`[${extensionName} DEBUG] Input invalid or negative. Clearing input field.`);
                 e.target.value = '';
            } else {
                 console.debug(`[${extensionName} DEBUG] Input valid. Keeping value: ${value}`);
                 e.target.value = value; // 保留有效的非负整数
            }
        });
    } else {
        console.warn(`[${extensionName}] Could not find #hide-last-n input element to attach listener.`);
    }

    // 优化后的保存设置按钮处理
    console.log(`[${extensionName}] Setting up click listener for #hide-save-settings-btn.`);
    $('#hide-save-settings-btn').on('click', async function() {
        console.log(`[${extensionName}] Save settings button clicked.`);
        const value = parseInt(hideLastNInput.value);
        const valueToSave = isNaN(value) || value < 0 ? 0 : value;
         console.log(`[${extensionName}] Save button: Parsed input value: ${value}. Value to save: ${valueToSave}`);

        // 获取当前设置，避免不必要的更新
        const currentSettings = getCurrentHideSettings();
        const currentValue = currentSettings?.hideLastN || 0;
         console.log(`[${extensionName}] Save button: Current saved value: ${currentValue}`);

        // 只有当设置实际发生变化时才保存和更新
        if (valueToSave !== currentValue) {
            console.log(`[${extensionName}] Save button: Value changed from ${currentValue} to ${valueToSave}. Proceeding with save.`);
            // 显示加载指示器
            const $btn = $(this);
            const originalText = $btn.text();
            $btn.text('保存中...').prop('disabled', true);
            console.log(`[${extensionName}] Save button: Calling saveCurrentHideSettings(${valueToSave}).`);
            const success = await saveCurrentHideSettings(valueToSave);
             console.log(`[${extensionName}] Save button: saveCurrentHideSettings returned: ${success}`);

            if (success) {
                console.log(`[${extensionName}] Save button: Save successful. Running full check and updating display.`);
                // 仅在成功保存后运行全量检查
                runFullHideCheck(); // 注意：这里直接调用，没有防抖，因为是用户明确操作
                updateCurrentHideSettingsDisplay();
                toastr.success('隐藏设置已保存');
            } else {
                 console.error(`[${extensionName}] Save button: Save failed.`);
                 // 错误消息应该由 saveCurrentHideSettings 内部处理
            }

            // 恢复按钮状态
             console.log(`[${extensionName}] Save button: Restoring button state.`);
            $btn.text(originalText).prop('disabled', false);
        } else {
            console.log(`[${extensionName}] Save button: Value (${valueToSave}) hasn't changed from current (${currentValue}). Skipping save.`);
            toastr.info('设置未更改');
        }
    });

    // 全部取消隐藏按钮 (现在是 async)
    console.log(`[${extensionName}] Setting up click listener for #hide-unhide-all-btn.`);
    $('#hide-unhide-all-btn').on('click', async function() { // 改为 async
        console.log(`[${extensionName}] Unhide all button clicked.`);
        await unhideAllMessages(); // 使用 await 调用
        console.log(`[${extensionName}] Unhide all process finished.`);
        // 成功或失败的消息已在 unhideAllMessages 中处理
    });

    // --- 重要：监听核心事件 ---

    // 监听聊天切换事件 (包括切换角色/群组，以及切换同一角色/群组的不同聊天记录)
    console.log(`[${extensionName}] Setting up listener for event: ${event_types.CHAT_CHANGED}`);
    eventSource.on(event_types.CHAT_CHANGED, (data) => { // 添加 data 参数以获取更多信息
        console.log(`[${extensionName}] Event received: ${event_types.CHAT_CHANGED}`, data); // 记录事件数据
        console.log(`[${extensionName}] CHAT_CHANGED: Clearing context cache.`);
        cachedContext = null; // 清除上下文缓存

        // 获取新上下文信息（用于日志）
        const newContext = getContextOptimized();
        const newCharId = newContext?.characterId;
        const newGroupId = newContext?.groupId;
        const newChatLength = newContext?.chat?.length;
        console.log(`[${extensionName}] CHAT_CHANGED: New context info - CharacterId: ${newCharId}, GroupId: ${newGroupId}, Chat Length: ${newChatLength}`);


        console.log(`[${extensionName}] CHAT_CHANGED: Updating global toggle display.`);
        // 更新全局启用/禁用状态显示
        $('#hide-helper-toggle').val(extension_settings[extensionName].enabled ? 'enabled' : 'disabled');

        console.log(`[${extensionName}] CHAT_CHANGED: Updating current hide settings display for new chat.`);
        // 更新当前角色的设置显示和输入框
        updateCurrentHideSettingsDisplay();

        // 聊天切换时执行全量检查 (如果插件启用)
        if (extension_settings[extensionName].enabled) {
            console.log(`[${extensionName}] CHAT_CHANGED: Extension is enabled. Scheduling debounced full hide check.`);
            runFullHideCheckDebounced();
        } else {
            console.log(`[${extensionName}] CHAT_CHANGED: Extension is disabled. Skipping full hide check.`);
        }
    });

    // 监听新消息事件 (发送和接收)
    const handleNewMessage = (eventType) => { // 添加 eventType 用于日志
        console.debug(`[${extensionName} DEBUG] Event received: ${eventType}`);
        if (extension_settings[extensionName].enabled) {
            console.debug(`[${extensionName} DEBUG] ${eventType}: Extension enabled. Scheduling incremental hide check.`);
            // 使用增量检查，稍作延迟以确保DOM更新和 chat 数组稳定
            setTimeout(() => runIncrementalHideCheck(), 100); // 增加一点延迟到100ms
        } else {
             console.debug(`[${extensionName} DEBUG] ${eventType}: Extension disabled. Skipping incremental check.`);
        }
    };
    console.log(`[${extensionName}] Setting up listener for event: ${event_types.MESSAGE_RECEIVED}`);
    eventSource.on(event_types.MESSAGE_RECEIVED, () => handleNewMessage(event_types.MESSAGE_RECEIVED));
    console.log(`[${extensionName}] Setting up listener for event: ${event_types.MESSAGE_SENT}`);
    eventSource.on(event_types.MESSAGE_SENT, () => handleNewMessage(event_types.MESSAGE_SENT));


    // 监听消息删除事件
    console.log(`[${extensionName}] Setting up listener for event: ${event_types.MESSAGE_DELETED}`);
    eventSource.on(event_types.MESSAGE_DELETED, () => {
        console.log(`[${extensionName}] Event received: ${event_types.MESSAGE_DELETED}`);
        if (extension_settings[extensionName].enabled) {
            console.log(`[${extensionName}] ${event_types.MESSAGE_DELETED}: Extension enabled. Scheduling debounced full hide check.`);
            runFullHideCheckDebounced(); // 使用防抖全量检查
        } else {
             console.log(`[${extensionName}] ${event_types.MESSAGE_DELETED}: Extension disabled. Skipping full check.`);
        }
    });

    // 监听流式响应结束事件 (可能导致多条消息状态更新)
    // 注意: SillyTavern 中 stream 结束的事件可能是 GENERATION_ENDED 或其他，确认一下 event_types
    // 假设 event_types.STREAM_END 存在且正确
    const streamEndEvent = event_types.GENERATION_ENDED; // 使用 GENERATION_ENDED 更可靠
    console.log(`[${extensionName}] Setting up listener for event: ${streamEndEvent} (assuming this indicates stream end)`);
    eventSource.on(streamEndEvent, () => {
         console.log(`[${extensionName}] Event received: ${streamEndEvent}`);
         if (extension_settings[extensionName].enabled) {
            console.log(`[${extensionName}] ${streamEndEvent}: Extension enabled. Scheduling debounced full hide check after stream end.`);
            // 流结束后，消息数量可能已稳定，执行一次增量检查可能不够，全量检查更保险
            runFullHideCheckDebounced();
        } else {
             console.log(`[${extensionName}] ${streamEndEvent}: Extension disabled. Skipping full check.`);
        }
    });

    console.log(`[${extensionName}] Exiting setupEventListeners.`);
}

// 初始化扩展
jQuery(async () => {
    console.log(`[${extensionName}] Initializing extension (jQuery ready)...`);
    loadSettings(); // 加载全局启用状态
    createUI(); // 创建界面元素

    // 初始加载时更新显示并执行检查
    // 延迟执行以确保 SillyTavern 的上下文已准备好
    const initialDelay = 1500; // 保持1.5秒延迟
    console.log(`[${extensionName}] Scheduling initial setup tasks with delay: ${initialDelay}ms`);
    setTimeout(() => {
        console.log(`[${extensionName}] Running initial setup tasks after delay.`);

        console.log(`[${extensionName}] Initial setup: Setting global toggle display.`);
        // 设置全局启用/禁用选择框的当前值
        $('#hide-helper-toggle').val(extension_settings[extensionName].enabled ? 'enabled' : 'disabled');

        console.log(`[${extensionName}] Initial setup: Updating current hide settings display.`);
        // 更新当前设置显示和输入框
        updateCurrentHideSettingsDisplay();

        // 初始加载时执行全量检查 (如果插件启用且有用户配置)
        if (extension_settings[extensionName].enabled) {
            console.log(`[${extensionName}] Initial setup: Extension is enabled. Checking if initial full check is needed.`);
            const initialSettings = getCurrentHideSettings();
             console.log(`[${extensionName}] Initial setup: Read initial settings:`, initialSettings);
            // 只有当 getCurrentHideSettings 返回非 null 且 userConfigured 为 true 时才执行初始检查
            // 避免在用户从未设置过的情况下隐藏消息
            if(initialSettings?.userConfigured === true) {
                console.log(`[${extensionName}] Initial setup: User configured settings found. Running initial full hide check.`);
                runFullHideCheck(); // 直接运行，非防抖
            } else {
                console.log(`[${extensionName}] Initial setup: No user configured settings found for the current entity. Skipping initial full check.`);
            }
        } else {
             console.log(`[${extensionName}] Initial setup: Extension is disabled. Skipping initial full check.`);
        }
        console.log(`[${extensionName}] Initial setup tasks completed.`);
    }, initialDelay); // 增加延迟时间
});
