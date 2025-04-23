import { extension_settings, loadExtensionSettings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types, getRequestHeaders } from "../../../../script.js";

const extensionName = "star12";
const LOG_PREFIX = `[${extensionName} LOG]`; // 日志前缀
const ERR_PREFIX = `[${extensionName} ERR]`; // 错误日志前缀
const defaultSettings = {
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
        console.log(`${LOG_PREFIX} Initializing DOM Cache...`);
        this.hideLastNInput = document.getElementById('hide-last-n');
        this.saveBtn = document.getElementById('hide-save-settings-btn');
        this.currentValueDisplay = document.getElementById('hide-current-value');
        console.log(`${LOG_PREFIX} DOM Cache initialized:`, this);
    }
};

// 获取优化的上下文
function getContextOptimized() {
    if (!cachedContext) {
        console.log(`${LOG_PREFIX} Context cache miss. Getting new context.`);
        cachedContext = getContext();
        if (!cachedContext) {
            console.warn(`${LOG_PREFIX} getContext() returned null/undefined.`);
        } else {
             console.log(`${LOG_PREFIX} Context cached. charId=${cachedContext.characterId}, groupId=${cachedContext.groupId}, chatLength=${cachedContext.chat?.length}`);
        }
    } else {
        // console.log(`${LOG_PREFIX} Context cache hit.`); // 减少冗余日志
    }
    return cachedContext;
}

// 初始化扩展设置 (仅包含全局启用状态)
function loadSettings() {
    console.log(`${LOG_PREFIX} Loading global extension settings...`);
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0 || typeof extension_settings[extensionName].enabled === 'undefined') {
        console.log(`${LOG_PREFIX} Initializing default global settings.`);
        extension_settings[extensionName].enabled = defaultSettings.enabled;
    }
    console.log(`${LOG_PREFIX} Global settings loaded:`, extension_settings[extensionName]);
}

// 创建UI面板 - 修改为简化版本，只有开启/关闭选项
function createUI() {
    console.log(`${LOG_PREFIX} Creating UI elements...`);
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
    $("#extensions_settings").append(settingsHtml);
    console.log(`${LOG_PREFIX} Settings panel added to extensions settings.`);

    // 创建聊天输入区旁边的按钮
    createInputWandButton();

    // 创建弹出对话框
    createPopup();

    // 设置事件监听器
    setupEventListeners();

    // 初始化DOM缓存 (延迟确保元素存在)
    setTimeout(() => domCache.init(), 500); // 稍微增加延迟
}

// 新增：创建输入区旁的按钮
function createInputWandButton() {
    const buttonHtml = `
    <div id="hide-helper-wand-button" class="list-group-item flex-container flexGap5" title="隐藏助手">
        <span style="padding-top: 2px;">
            <i class="fa-solid fa-ghost"></i>
        </span>
        <span>隐藏助手</span>
    </div>`;

    $('#data_bank_wand_container').append(buttonHtml);
    console.log(`${LOG_PREFIX} Wand button added next to input.`);
}

// 新增：创建弹出对话框
function createPopup() {
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

    $('body').append(popupHtml);
    console.log(`${LOG_PREFIX} Popup created and appended to body.`);
}

// 获取当前角色/群组的隐藏设置 (从角色/群组数据读取)
function getCurrentHideSettings() {
    console.log(`${LOG_PREFIX} Attempting to get current hide settings...`);
    const context = getContextOptimized();
    if (!context) {
        console.warn(`${LOG_PREFIX} getCurrentHideSettings: Context not available.`);
        return null;
    }

    const isGroup = !!context.groupId;
    let target = null;
    let settings = null;

    console.log(`${LOG_PREFIX} getCurrentHideSettings: Context check - isGroup=${isGroup}, charId=${context.characterId}, groupId=${context.groupId}`);

    if (isGroup) {
        if (!context.groups) {
            console.warn(`${LOG_PREFIX} getCurrentHideSettings: context.groups is missing.`);
            return null;
        }
        target = context.groups.find(x => x.id == context.groupId);
        if (target) {
            // 从 group.data 读取
            settings = target.data?.hideHelperSettings || null;
            console.log(`${LOG_PREFIX} getCurrentHideSettings: Found group ${context.groupId}. Raw settings from group.data:`, target.data?.hideHelperSettings);
        } else {
            console.warn(`${LOG_PREFIX} getCurrentHideSettings: Group ${context.groupId} not found in context.groups.`);
        }
    } else { // 是角色
        if (!context.characters) {
             console.warn(`${LOG_PREFIX} getCurrentHideSettings: context.characters is missing.`);
             return null;
        }
        if (context.characterId !== undefined && context.characterId >= 0 && context.characterId < context.characters.length) {
           target = context.characters[context.characterId];
           if (target) {
                // 从 character.data.extensions 读取 (遵循 V2 卡片规范)
                settings = target.data?.extensions?.hideHelperSettings || null;
                console.log(`${LOG_PREFIX} getCurrentHideSettings: Found character index ${context.characterId} (${target.name}). Raw settings from char.data.extensions:`, target.data?.extensions?.hideHelperSettings);
           } else {
                console.warn(`${LOG_PREFIX} getCurrentHideSettings: Character object at index ${context.characterId} is missing.`);
           }
        } else {
             console.warn(`${LOG_PREFIX} getCurrentHideSettings: Invalid characterId: ${context.characterId}. Characters length: ${context.characters.length}`);
        }
    }

    console.log(`${LOG_PREFIX} getCurrentHideSettings: Returning settings:`, settings);
    return settings; // 如果找不到目标或数据，返回 null
}


// 保存当前角色/群组的隐藏设置 (通过API持久化)
async function saveCurrentHideSettings(hideLastN) {
    const startTime = performance.now();
    console.log(`${LOG_PREFIX} saveCurrentHideSettings: Attempting to save hideLastN = ${hideLastN}`);
    const context = getContextOptimized();
    if (!context) {
        console.error(`${ERR_PREFIX} saveCurrentHideSettings: Cannot save settings: Context not available.`);
        return false;
    }
    const isGroup = !!context.groupId;
    const chatLength = context.chat?.length || 0; // 在获取目标前计算，避免目标不存在时出错
    console.log(`${LOG_PREFIX} saveCurrentHideSettings: Context details - isGroup=${isGroup}, charId=${context.characterId}, groupId=${context.groupId}, currentChatLength=${chatLength}`);

    const settingsToSave = {
        hideLastN: hideLastN >= 0 ? hideLastN : 0, // 确保非负
        lastProcessedLength: chatLength, // 保存 *当前* 聊天的长度作为基准
        userConfigured: true // 标记用户已手动配置
    };
    console.log(`${LOG_PREFIX} saveCurrentHideSettings: Settings object to save:`, settingsToSave);

    let targetId = null;
    let saveUrl = '';
    let payload = {};

    if (isGroup) {
        targetId = context.groupId;
        console.log(`${LOG_PREFIX} saveCurrentHideSettings: Saving for GROUP ID: ${targetId}`);
        if (!context.groups) {
            console.error(`${ERR_PREFIX} saveCurrentHideSettings: context.groups missing, cannot save for group.`);
            return false;
        }
        const group = context.groups.find(x => x.id == targetId);
        if (!group) {
             console.error(`${ERR_PREFIX} saveCurrentHideSettings: Cannot save settings: Group ${targetId} not found in context.`);
             return false;
        }

        // 1. (内存修改 - 用于立即反馈)
        group.data = group.data || {};
        group.data.hideHelperSettings = { ...settingsToSave }; // 创建副本以防意外修改
        console.log(`${LOG_PREFIX} saveCurrentHideSettings: Updated group object in memory (before API call):`, group);

        // 2. 持久化 (准备API请求)
        saveUrl = '/api/groups/edit';
        payload = {
             ...group, // 包含ID和其他所有现有字段
             data: { // 合并或覆盖 data 字段
                 ...(group.data || {}), // 保留 data 中其他可能存在的字段
                 hideHelperSettings: { ...settingsToSave } // 添加或更新我们的设置
             }
        };

    } else { // 是角色
        console.log(`${LOG_PREFIX} saveCurrentHideSettings: Saving for CHARACTER index: ${context.characterId}`);
        if (!context.characters || context.characterId === undefined || context.characterId < 0 || context.characterId >= context.characters.length) {
             console.error(`${ERR_PREFIX} saveCurrentHideSettings: Cannot save settings: Character context is invalid. charId=${context.characterId}, length=${context.characters?.length}`);
             return false;
        }
        const character = context.characters[context.characterId];
        if (!character || !character.avatar) {
            console.error(`${ERR_PREFIX} saveCurrentHideSettings: Cannot save settings: Character or character avatar not found at index ${context.characterId}. Character:`, character);
            return false;
        }
        targetId = character.avatar; // 获取头像文件名作为唯一标识
         console.log(`${LOG_PREFIX} saveCurrentHideSettings: Saving for CHARACTER AVATAR: ${targetId}`);

        // 1. (内存修改)
        character.data = character.data || {};
        character.data.extensions = character.data.extensions || {}; // 确保 extensions 对象存在
        character.data.extensions.hideHelperSettings = { ...settingsToSave }; // 创建副本
        console.log(`${LOG_PREFIX} saveCurrentHideSettings: Updated character object in memory (before API call):`, character);


        // 2. 持久化 (准备API请求)
        saveUrl = '/api/characters/merge-attributes';
        payload = {
            avatar: targetId, // API 需要知道是哪个角色
            data: { // 只发送需要更新/合并的部分
                extensions: {
                    hideHelperSettings: { ...settingsToSave }
                }
            }
        };
    }

    console.log(`${LOG_PREFIX} saveCurrentHideSettings: Sending API request to ${saveUrl} for target ${targetId}. Payload:`, JSON.parse(JSON.stringify(payload))); // Log clean payload
    try {
        const response = await fetch(saveUrl, {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(payload)
        });

        const duration = performance.now() - startTime;
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`${ERR_PREFIX} saveCurrentHideSettings: Failed to save settings for ${targetId}. Status: ${response.status}. Response: ${errorText}. Duration: ${duration.toFixed(2)}ms`);
            toastr.error(`保存设置失败: ${response.status} ${errorText}`);
            return false;
        }
        console.log(`${LOG_PREFIX} saveCurrentHideSettings: Settings saved successfully for ${targetId}. Duration: ${duration.toFixed(2)}ms`);
        return true;
    } catch (error) {
        const duration = performance.now() - startTime;
        console.error(`${ERR_PREFIX} saveCurrentHideSettings: Network error during fetch to save settings for ${targetId}:`, error, `Duration: ${duration.toFixed(2)}ms`);
        toastr.error(`保存设置时发生网络错误: ${error.message}`);
        return false;
    }
}

// 更新当前设置显示 - 优化使用DOM缓存
function updateCurrentHideSettingsDisplay() {
    console.log(`${LOG_PREFIX} updateCurrentHideSettingsDisplay: Updating display...`);
    const currentSettings = getCurrentHideSettings(); // 会打印内部日志

    if (!domCache.currentValueDisplay || !domCache.hideLastNInput) {
        console.warn(`${LOG_PREFIX} updateCurrentHideSettingsDisplay: DOM cache not ready, attempting init.`);
        domCache.init(); // 尝试重新初始化
        if (!domCache.currentValueDisplay || !domCache.hideLastNInput) {
            console.error(`${ERR_PREFIX} updateCurrentHideSettingsDisplay: DOM elements still not found after re-init. Aborting update.`);
            return;
        }
    }

    const displayValue = (currentSettings && currentSettings.hideLastN > 0) ? currentSettings.hideLastN : '无';
    const inputValue = (currentSettings && currentSettings.hideLastN > 0) ? currentSettings.hideLastN : '';

    console.log(`${LOG_PREFIX} updateCurrentHideSettingsDisplay: Setting display text to "${displayValue}", input value to "${inputValue}"`);
    domCache.currentValueDisplay.textContent = displayValue;
    domCache.hideLastNInput.value = inputValue;
     console.log(`${LOG_PREFIX} updateCurrentHideSettingsDisplay: Display updated.`);
}

// 防抖函数
function debounce(fn, delay) {
    let timer;
    return function(...args) {
        const context = this; // 保存上下文
        console.log(`${LOG_PREFIX} Debounce: Timer cleared for ${fn.name}.`);
        clearTimeout(timer);
        timer = setTimeout(() => {
            console.log(`${LOG_PREFIX} Debounce: Timer expired. Executing ${fn.name}.`);
            fn.apply(context, args);
        }, delay);
    };
}

// 防抖版本的全量检查
const runFullHideCheckDebounced = debounce(runFullHideCheck, 300); // 稍微增加延迟给SillyTavern时间反应

/**
 * 检查是否应该执行隐藏/取消隐藏操作
 * 只有当插件启用，并且当前角色/群组存在用户配置过的设置时才返回true
 */
function shouldProcessHiding() {
    // 1. 检查插件是否全局启用
    if (!extension_settings[extensionName]?.enabled) {
        // console.log(`${LOG_PREFIX} shouldProcessHiding: Skipping, Plugin globally disabled.`); // 减少噪音
        return false;
    }

    // 2. 获取当前设置
    const settings = getCurrentHideSettings(); // 会打印内部日志

    // 3. 检查是否存在设置以及是否由用户配置过
    if (!settings || settings.userConfigured !== true) {
        // console.log(`${LOG_PREFIX} shouldProcessHiding: Skipping, No settings found or 'userConfigured' is not true. Settings:`, settings); // 减少噪音
        return false;
    }

    console.log(`${LOG_PREFIX} shouldProcessHiding: Conditions met. Should process hiding. Settings:`, settings);
    return true; // 插件已启用且有用户配置
}

/**
 * 增量隐藏检查 (用于新消息到达) - 几乎不会用到，因为保存时会记录长度，全量检查更可靠
 * 仅处理从上次处理长度到现在新增的、需要隐藏的消息
 */
async function runIncrementalHideCheck() {
    const startTime = performance.now();
    console.log(`${LOG_PREFIX} runIncrementalHideCheck: Starting incremental check...`);

    if (!shouldProcessHiding()) {
        console.log(`${LOG_PREFIX} runIncrementalHideCheck: Aborted by shouldProcessHiding().`);
        return;
    }

    const context = getContextOptimized();
    if (!context || !context.chat) {
        console.warn(`${LOG_PREFIX} runIncrementalHideCheck: Aborted. Context or chat not available.`);
        return;
    }

    const chat = context.chat;
    const currentChatLength = chat.length;
    const settings = getCurrentHideSettings() || { hideLastN: 0, lastProcessedLength: 0, userConfigured: false }; // 提供默认值
    const { hideLastN, lastProcessedLength = 0 } = settings; // 从 settings 解构

    console.log(`${LOG_PREFIX} runIncrementalHideCheck: currentChatLength=${currentChatLength}, settings=`, settings);

    // --- 前置条件检查 ---
    if (currentChatLength <= 0 || hideLastN <= 0) {
        console.log(`${LOG_PREFIX} runIncrementalHideCheck: Skipping. Chat empty or hideLastN <= 0.`);
        // 检查是否需要更新长度 (仅在用户配置过且长度实际变化时)
        if (settings.userConfigured && currentChatLength !== lastProcessedLength) {
            console.log(`${LOG_PREFIX} runIncrementalHideCheck: Chat length changed (${lastProcessedLength} -> ${currentChatLength}) but no hiding needed. Updating lastProcessedLength.`);
            await saveCurrentHideSettings(hideLastN); // 保存以更新长度
        }
        return;
    }

    if (currentChatLength <= lastProcessedLength) {
        console.log(`${LOG_PREFIX} runIncrementalHideCheck: Skipping. Chat length did not increase (${lastProcessedLength} -> ${currentChatLength}). Assuming full check will handle deletes/edits.`);
        // 不需要更新长度，因为没有新增
        return;
    }

    // --- 计算范围 ---
    const targetVisibleStart = Math.max(0, currentChatLength - hideLastN);
    const previousVisibleStart = Math.max(0, lastProcessedLength - hideLastN); // 处理首次的情况并确保非负
    console.log(`${LOG_PREFIX} runIncrementalHideCheck: targetVisibleStart=${targetVisibleStart}, previousVisibleStart=${previousVisibleStart}`);

    const toHideIncrementally = [];
    // 只有当可见起点向后移动时，才有新的消息需要隐藏
    if (targetVisibleStart > previousVisibleStart) {
        const startIndex = previousVisibleStart; // 从上一次可见的开始
        const endIndex = targetVisibleStart;    // 到这一次可见的开始 (不含)
        console.log(`${LOG_PREFIX} runIncrementalHideCheck: Checking range [${startIndex}, ${endIndex}) for messages to hide.`);

        // --- 收集需要隐藏的消息 ---
        for (let i = startIndex; i < endIndex; i++) {
            // 检查消息是否存在且不是系统消息 (允许隐藏用户和AI消息)
            if (chat[i] && chat[i].is_system !== true) {
                toHideIncrementally.push(i);
            } else if (chat[i]) {
                 console.log(`${LOG_PREFIX} runIncrementalHideCheck: Skipping message index ${i} because it's a system message.`);
            } else {
                 console.log(`${LOG_PREFIX} runIncrementalHideCheck: Skipping message index ${i} because it's undefined/null.`);
            }
        }
        console.log(`${LOG_PREFIX} runIncrementalHideCheck: Messages to hide incrementally: [${toHideIncrementally.join(', ')}]`);

        // --- 执行批量更新 ---
        if (toHideIncrementally.length > 0) {
            console.log(`${LOG_PREFIX} runIncrementalHideCheck: Applying incremental hiding...`);
            // 1. 批量更新数据 (chat 数组)
            toHideIncrementally.forEach(idx => { if (chat[idx]) chat[idx].is_system = true; });
            console.log(`${LOG_PREFIX} runIncrementalHideCheck: chat array data updated in memory.`);

            // 2. 批量更新 DOM
            try {
                const hideSelector = toHideIncrementally.map(id => `.mes[mesid="${id}"]`).join(',');
                if (hideSelector) {
                    $(hideSelector).attr('is_system', 'true');
                    console.log(`${LOG_PREFIX} runIncrementalHideCheck: DOM updated for messages: ${toHideIncrementally.join(', ')}`);
                }
            } catch (error) {
                console.error(`${ERR_PREFIX} runIncrementalHideCheck: Error updating DOM incrementally:`, error);
            }

            // 3. 更新处理长度并保存设置（重要：现在需要 await）
            console.log(`${LOG_PREFIX} runIncrementalHideCheck: Hiding applied. Saving settings to update lastProcessedLength to ${currentChatLength}.`);
            await saveCurrentHideSettings(hideLastN);

        } else {
             console.log(`${LOG_PREFIX} runIncrementalHideCheck: No messages needed hiding in the new range.`);
             // 即使没有隐藏，如果长度变了，也需要更新设置中的 lastProcessedLength
             if (settings.userConfigured && settings.lastProcessedLength !== currentChatLength) {
                 console.log(`${LOG_PREFIX} runIncrementalHideCheck: Length changed (${lastProcessedLength} -> ${currentChatLength}). Saving settings to update lastProcessedLength.`);
                 await saveCurrentHideSettings(hideLastN);
             }
        }
    } else {
        console.log(`${LOG_PREFIX} runIncrementalHideCheck: Visible start did not advance or range invalid.`);
        // 即使没有隐藏，如果长度变了，也需要更新设置中的 lastProcessedLength
         if (settings.userConfigured && settings.lastProcessedLength !== currentChatLength) {
             console.log(`${LOG_PREFIX} runIncrementalHideCheck: Length changed (${lastProcessedLength} -> ${currentChatLength}). Saving settings to update lastProcessedLength.`);
             await saveCurrentHideSettings(hideLastN);
         }
    }

    console.log(`${LOG_PREFIX} runIncrementalHideCheck completed in ${performance.now() - startTime}ms`);
}

/**
 * 全量隐藏检查 (优化的差异更新)
 * 用于加载、切换、删除、设置更改等情况
 */
async function runFullHideCheck() {
    const startTime = performance.now();
    console.log(`${LOG_PREFIX} runFullHideCheck: Starting full check...`);

    if (!shouldProcessHiding()) {
        console.log(`${LOG_PREFIX} runFullHideCheck: Aborted by shouldProcessHiding().`);
        // 如果是因为插件禁用或未配置，可能需要确保所有消息都可见
        // 但为了避免意外取消隐藏，暂时不处理，让用户手动取消
        return;
    }

    const context = getContextOptimized();
    if (!context || !context.chat) {
        console.warn(`${LOG_PREFIX} runFullHideCheck: Aborted. Context or chat not available.`);
        return;
    }
    const chat = context.chat;
    const currentChatLength = chat.length;

    // 加载当前角色的设置
    const settings = getCurrentHideSettings() || { hideLastN: 0, lastProcessedLength: 0, userConfigured: false };
    const { hideLastN } = settings; // 解构 hideLastN

    console.log(`${LOG_PREFIX} runFullHideCheck: currentChatLength=${currentChatLength}, using settings=`, settings);

    // 1. 计算可见边界
    const visibleStart = hideLastN <= 0 ? 0 : Math.max(0, currentChatLength - hideLastN);
    console.log(`${LOG_PREFIX} runFullHideCheck: Calculated visibleStart index = ${visibleStart}`);

    // 2. 差异计算和数据更新阶段
    const toHide = [];
    const toShow = [];
    let changed = false;

    console.log(`${LOG_PREFIX} runFullHideCheck: Iterating through chat messages (0 to ${currentChatLength - 1}) to determine state...`);
    for (let i = 0; i < currentChatLength; i++) {
        const msg = chat[i];
        if (!msg) {
            // console.log(`${LOG_PREFIX} runFullHideCheck: Skipping index ${i}, message is null/undefined.`); // 减少噪音
            continue;
        }

        // 修正：SillyTavern 的隐藏是通过添加 is_system=true 实现的
        const isCurrentlyHidden = msg.is_system === true;
        const shouldBeHidden = i < visibleStart && msg.is_system !== true; // 只有当消息应该隐藏但当前未隐藏时才加入 toHide
        const shouldBeShown = i >= visibleStart && msg.is_system === true; // 只有当消息应该显示但当前被隐藏时才加入 toShow

        // console.log(`${LOG_PREFIX} runFullHideCheck: Index ${i}: isCurrentlyHidden=${isCurrentlyHidden}, shouldBeHidden=${shouldBeHidden}, shouldBeShown=${shouldBeShown}`); // 非常详细，可取消注释

        if (shouldBeHidden) {
            console.log(`${LOG_PREFIX} runFullHideCheck: Index ${i} marked TO HIDE.`);
            msg.is_system = true; // 更新内存数据
            toHide.push(i);
            changed = true;
        } else if (shouldBeShown) {
            console.log(`${LOG_PREFIX} runFullHideCheck: Index ${i} marked TO SHOW.`);
             // 重要：取消隐藏时，要恢复 is_system 为 false
             // 我们假设原始的 is_system 状态都是 false（除了真正的系统消息，但我们的逻辑不应该隐藏它们）
            msg.is_system = false; // 更新内存数据
            toShow.push(i);
            changed = true;
        }
    }
    console.log(`${LOG_PREFIX} runFullHideCheck: Iteration complete. Found ${toHide.length} messages to hide, ${toShow.length} messages to show. Changed=${changed}`);

    // 3. 只有在有更改时才执行DOM更新
    if (changed) {
        console.log(`${LOG_PREFIX} runFullHideCheck: Applying DOM updates...`);
        try {
            // 批量处理隐藏消息
            if (toHide.length > 0) {
                const hideSelector = toHide.map(id => `.mes[mesid="${id}"]`).join(',');
                if (hideSelector) {
                    $(hideSelector).attr('is_system', 'true');
                    console.log(`${LOG_PREFIX} runFullHideCheck: DOM HIDE applied to: [${toHide.join(', ')}]`);
                }
            }

            // 批量处理显示消息
            if (toShow.length > 0) {
                const showSelector = toShow.map(id => `.mes[mesid="${id}"]`).join(',');
                if (showSelector) {
                    // 确保移除 is_system 属性或设为 false
                    $(showSelector).attr('is_system', 'false'); // 直接设为 'false' 更明确
                    console.log(`${LOG_PREFIX} runFullHideCheck: DOM SHOW applied to: [${toShow.join(', ')}]`);
                }
            }
            console.log(`${LOG_PREFIX} runFullHideCheck: DOM updates finished.`);

            // 触发 SillyTavern 的滑动按钮更新 (可能需要)
            if (context.hideSwipeButtons && context.showSwipeButtons) {
                 console.log(`${LOG_PREFIX} runFullHideCheck: Calling hideSwipeButtons/showSwipeButtons.");
                 context.hideSwipeButtons();
                 context.showSwipeButtons();
            }

            // 触发聊天保存 (Debounced) - 因为我们修改了 chat 数组中的 is_system
            if (context.saveChatDebounced) {
                 console.log(`${LOG_PREFIX} runFullHideCheck: Calling saveChatDebounced() because chat data changed.");
                 context.saveChatDebounced();
            } else {
                console.warn(`${LOG_PREFIX} runFullHideCheck: context.saveChatDebounced is not available.`);
            }

        } catch (error) {
            console.error(`${ERR_PREFIX} runFullHideCheck: Error updating DOM:`, error);
        }
    } else {
        console.log(`${LOG_PREFIX} runFullHideCheck: No changes detected, skipping DOM updates and save.`);
    }

    // 4. 更新处理长度并保存设置（只有在用户配置过且长度与记录不符时）
    // 这一步确保 lastProcessedLength 与当前状态同步，即使没有消息被隐藏/显示
    if (settings.userConfigured && settings.lastProcessedLength !== currentChatLength) {
        console.log(`${LOG_PREFIX} runFullHideCheck: Chat length (${currentChatLength}) differs from saved length (${settings.lastProcessedLength}). Updating settings.`);
        await saveCurrentHideSettings(hideLastN); // 使用 await
    } else {
         console.log(`${LOG_PREFIX} runFullHideCheck: Chat length matches saved length or user has not configured. Skipping settings update.`);
    }
     console.log(`${LOG_PREFIX} runFullHideCheck completed in ${performance.now() - startTime}ms`);
}

// 新增：全部取消隐藏功能
async function unhideAllMessages() {
    const startTime = performance.now();
    console.log(`${LOG_PREFIX} unhideAllMessages: Starting unhide all process...`);
    const context = getContextOptimized();
    if (!context || !context.chat) {
         console.warn(`${LOG_PREFIX} unhideAllMessages: Aborted. Chat data not available.`);
         return;
    }
    const chat = context.chat;

    if (chat.length === 0) {
        console.log(`${LOG_PREFIX} unhideAllMessages: Chat is empty.`);
        // 即使聊天为空，也要确保设置被重置为 0 并保存
        console.log(`${LOG_PREFIX} unhideAllMessages: Resetting hide setting to 0 and saving.`);
        await saveCurrentHideSettings(0); // 仍然需要保存重置
        updateCurrentHideSettingsDisplay();
        return;
    }

    // 找出所有当前标记为 is_system=true 的消息 (这些是可能被我们隐藏的)
    const toShow = [];
    console.log(`${LOG_PREFIX} unhideAllMessages: Checking chat (length ${chat.length}) for hidden messages (is_system=true)...`);
    for (let i = 0; i < chat.length; i++) {
        // 确保只取消隐藏那些 *被我们插件隐藏* 的消息
        // 真正的系统消息我们不应该修改，但很难区分
        // 简单起见，我们取消所有 is_system=true 的消息
        // 更好的方法是记录哪些消息是插件隐藏的，但目前 S T 没有这个机制
        if (chat[i] && chat[i].is_system === true) {
            toShow.push(i);
        }
    }
    console.log(`${LOG_PREFIX} unhideAllMessages: Found ${toShow.length} messages to unhide: [${toShow.join(', ')}]`);

    // 批量更新数据和DOM
    if (toShow.length > 0) {
        console.log(`${LOG_PREFIX} unhideAllMessages: Applying unhide changes...`);
        // 更新数据
        toShow.forEach(idx => { if (chat[idx]) chat[idx].is_system = false; });
         console.log(`${LOG_PREFIX} unhideAllMessages: chat array data updated in memory.`);

        // 更新DOM
        try {
            const showSelector = toShow.map(id => `.mes[mesid="${id}"]`).join(',');
            if (showSelector) {
                $(showSelector).attr('is_system', 'false'); // 明确设为 false
                console.log(`${LOG_PREFIX} unhideAllMessages: DOM SHOW applied to: [${toShow.join(', ')}]`);
            }
        } catch (error) {
            console.error(`${ERR_PREFIX} unhideAllMessages: Error updating DOM when unhiding all:`, error);
        }

        // 触发相关更新
         if (context.hideSwipeButtons && context.showSwipeButtons) {
                 console.log(`${LOG_PREFIX} unhideAllMessages: Calling hideSwipeButtons/showSwipeButtons.");
                 context.hideSwipeButtons();
                 context.showSwipeButtons();
            }
         if (context.saveChatDebounced) {
                 console.log(`${LOG_PREFIX} unhideAllMessages: Calling saveChatDebounced() because chat data changed.");
                 context.saveChatDebounced();
            } else {
                 console.warn(`${LOG_PREFIX} unhideAllMessages: context.saveChatDebounced is not available.`);
            }

        console.log(`${LOG_PREFIX} unhideAllMessages: Unhide changes applied.`);
    } else {
        console.log(`${LOG_PREFIX} unhideAllMessages: No hidden messages found to unhide.`);
    }

    // 重要修改：重置隐藏设置为0，并通过 API 保存
    console.log(`${LOG_PREFIX} unhideAllMessages: Resetting hide setting to 0 and saving.`);
    const success = await saveCurrentHideSettings(0);
    if (success) {
        console.log(`${LOG_PREFIX} unhideAllMessages: Successfully saved hide setting reset to 0.`);
        updateCurrentHideSettingsDisplay(); // 只有保存成功才更新显示
    } else {
        console.error(`${ERR_PREFIX} unhideAllMessages: Failed to save hide setting reset to 0.`);
        toastr.error("无法重置并保存隐藏设置。");
    }
     console.log(`${LOG_PREFIX} unhideAllMessages completed in ${performance.now() - startTime}ms`);
}

// 设置UI元素的事件监听器
function setupEventListeners() {
    console.log(`${LOG_PREFIX} Setting up event listeners...`);

    // 设置弹出对话框按钮事件
    $(document).on('click', '#hide-helper-wand-button', function() {
        console.log(`${LOG_PREFIX} Wand button clicked.`);
        if (!extension_settings[extensionName]?.enabled) {
            console.warn(`${LOG_PREFIX} Wand button click ignored: Plugin disabled.`);
            toastr.warning('隐藏助手当前已禁用，请在扩展设置中启用。');
            return;
        }
        console.log(`${LOG_PREFIX} Updating display before showing popup...`);
        updateCurrentHideSettingsDisplay(); // Update display values before showing

        const $popup = $('#hide-helper-popup');
        console.log(`${LOG_PREFIX} Showing popup...`);
        $popup.css({ // 先设置基本样式，位置稍后计算
            'display': 'block',
            'visibility': 'hidden', // 隐藏以便计算位置
            'position': 'fixed',   // 使用 fixed 定位
            'left': '50%',
            'transform': 'translateX(-50%)',
            'top': '50px' // 默认顶部位置，稍后调整
        });

        // 确保弹出框内容渲染完成再计算位置
        setTimeout(() => {
            try {
                const popupHeight = $popup.outerHeight();
                const windowHeight = $(window).height();
                 // 简单的居中逻辑，顶部至少10px，底部至少50px
                let topPosition = (windowHeight - popupHeight) / 2;
                topPosition = Math.max(10, topPosition); // 保证顶部至少10px
                topPosition = Math.min(topPosition, windowHeight - popupHeight - 50); // 保证底部至少50px
                topPosition = Math.max(10, topPosition); // 再次确保顶部至少10px

                console.log(`${LOG_PREFIX} Centering popup: windowH=${windowHeight}, popupH=${popupHeight}, calculatedTop=${topPosition}`);
                $popup.css({
                    'top': topPosition + 'px',
                    'visibility': 'visible' // 计算完位置再显示
                });
            } catch(e) {
                console.error(`${ERR_PREFIX} Error calculating popup position:`, e);
                // 出错时也尝试显示
                $popup.css({'visibility': 'visible'});
            }
        }, 0); // 使用 setTimeout 0 延迟执行
    });

    // 弹出框关闭按钮事件
    $(document).on('click', '#hide-helper-popup-close', function() {
        console.log(`${LOG_PREFIX} Popup close button clicked.`);
        $('#hide-helper-popup').hide();
    });

    // 设置选项更改事件 (全局启用/禁用) - 在 #extensions_settings 内查找
    $('#extensions_settings').on('change', '#hide-helper-toggle', function() {
        const isEnabled = $(this).val() === 'enabled';
        console.log(`${LOG_PREFIX} Global toggle changed. New state: ${isEnabled ? 'Enabled' : 'Disabled'}`);
        extension_settings[extensionName].enabled = isEnabled;
        saveSettingsDebounced(); // 保存全局设置

        if (isEnabled) {
            toastr.success('隐藏助手已启用');
            console.log(`${LOG_PREFIX} Plugin enabled. Running full hide check.`);
            // 启用时，执行一次全量检查来应用当前角色的隐藏状态
            runFullHideCheckDebounced(); // 使用防抖版本
        } else {
            toastr.warning('隐藏助手已禁用');
            console.log(`${LOG_PREFIX} Plugin disabled. Hiding checks will be skipped.`);
            // 禁用时，用户可能期望已隐藏的保持隐藏，或者全部取消隐藏？
            // 当前行为：不自动取消隐藏，保留状态，但不再进行新的隐藏检查。
            // 如果需要禁用时取消隐藏，可以在这里调用 unhideAllMessages()
            // unhideAllMessages(); // 取消注释则禁用时会取消所有隐藏
        }
    });

    // 使用事件委托处理动态添加的输入框
    $(document).on('input', '#hide-last-n', (e) => {
         const value = parseInt(e.target.value);
         // console.log(`${LOG_PREFIX} Input changed: raw='${e.target.value}', parsed=${value}`); // 减少噪音
         if (isNaN(value) || value < 0) {
             // console.log(`${LOG_PREFIX} Input invalid, clearing.`); // 减少噪音
             e.target.value = '';
         } else {
             e.target.value = value; // 保留有效的非负整数
         }
     });

    // 优化后的保存设置按钮处理 (使用事件委托)
    $(document).on('click', '#hide-save-settings-btn', async function() {
        console.log(`${LOG_PREFIX} Save settings button clicked.`);
        const $input = $('#hide-last-n'); // 获取输入框
        if (!$input.length) {
             console.error(`${ERR_PREFIX} Save button click: Input field #hide-last-n not found.`);
             return;
        }
        const rawValue = $input.val();
        const value = parseInt(rawValue);
        const valueToSave = isNaN(value) || value < 0 ? 0 : value;
        console.log(`${LOG_PREFIX} Save button click: rawValue='${rawValue}', valueToSave=${valueToSave}`);

        // 获取当前设置，避免不必要的更新
        const currentSettings = getCurrentHideSettings(); // 会打印日志
        const currentValue = currentSettings?.hideLastN || 0;
         console.log(`${LOG_PREFIX} Save button click: currentValue=${currentValue}`);

        // 只有当设置实际发生变化时才保存和更新
        if (valueToSave !== currentValue) {
            console.log(`${LOG_PREFIX} Save button click: Value changed (${currentValue} -> ${valueToSave}). Proceeding with save...`);
            const $btn = $(this);
            const originalText = $btn.text();
            $btn.text('保存中...').prop('disabled', true);
            console.log(`${LOG_PREFIX} Save button click: Button state set to saving.`);

            const success = await saveCurrentHideSettings(valueToSave); // 会打印详细日志

            if (success) {
                console.log(`${LOG_PREFIX} Save successful. Running full hide check and updating display.`);
                // 仅在成功保存后运行全量检查
                runFullHideCheck(); // 立即执行全量检查以应用新设置
                updateCurrentHideSettingsDisplay(); // 更新显示
                toastr.success('隐藏设置已保存');
            } else {
                 console.error(`${ERR_PREFIX} Save failed. Check previous logs.`);
                 // 可以在这里恢复输入框的值到保存前的值吗？可能复杂
            }

            // 恢复按钮状态
            $btn.text(originalText).prop('disabled', false);
            console.log(`${LOG_PREFIX} Save button click: Button state restored.`);
        } else {
            console.log(`${LOG_PREFIX} Save button click: Value unchanged (${currentValue}). No API call needed.`);
            toastr.info('设置未更改');
        }
         // 不论是否保存，都关闭 popup？或者让用户手动关？ 目前：不自动关闭
         // $('#hide-helper-popup').hide();
    });

    // 全部取消隐藏按钮 (现在是 async, 使用事件委托)
    $(document).on('click', '#hide-unhide-all-btn', async function() {
        console.log(`${LOG_PREFIX} Unhide all button clicked.`);
        const $btn = $(this);
        const originalText = $btn.text();
        $btn.text('处理中...').prop('disabled', true);

        await unhideAllMessages(); // 会打印详细日志

        $btn.text(originalText).prop('disabled', false);
        console.log(`${LOG_PREFIX} Unhide all button state restored.`);
         // updateCurrentHideSettingsDisplay(); // unhideAllMessages 内部成功时会调用
         // $('#hide-helper-popup').hide(); // 关闭 popup?
    });

    // --- 核心事件监听 ---

    // 监听聊天切换事件
    eventSource.on(event_types.CHAT_CHANGED, () => {
        console.log(`%c${LOG_PREFIX} Event received: ${event_types.CHAT_CHANGED}`, 'color: blue; font-weight: bold;');
        cachedContext = null; // 清除上下文缓存
        console.log(`${LOG_PREFIX} Cleared context cache due to chat change.`);

        // 延迟执行，等待 SillyTavern 加载完新聊天数据
        setTimeout(() => {
            console.log(`${LOG_PREFIX} CHAT_CHANGED timeout triggered. Updating UI and running check...`);
            const context = getContextOptimized(); // 获取新上下文
            if (!context) {
                console.error(`${ERR_PREFIX} CHAT_CHANGED timeout: Failed to get context after chat change.`);
                return;
            }
             console.log(`${LOG_PREFIX} CHAT_CHANGED timeout: New context - charId=${context.characterId}, groupId=${context.groupId}, chatLength=${context.chat?.length}`);


            // 更新全局启用/禁用状态显示
             const globalToggle = $('#hide-helper-toggle');
             if (globalToggle.length) {
                 globalToggle.val(extension_settings[extensionName].enabled ? 'enabled' : 'disabled');
                 console.log(`${LOG_PREFIX} CHAT_CHANGED timeout: Updated global toggle display.`);
             } else {
                 console.warn(`${LOG_PREFIX} CHAT_CHANGED timeout: Global toggle #hide-helper-toggle not found.`);
             }


            // 更新当前角色的设置显示和输入框 (在 popup 打开时才重要，但这里调用以保持一致)
            updateCurrentHideSettingsDisplay(); // 会打印日志

            // 聊天切换时执行全量检查 (如果插件启用)
            if (extension_settings[extensionName].enabled) {
                console.log(`${LOG_PREFIX} CHAT_CHANGED timeout: Plugin enabled. Calling runFullHideCheckDebounced().`);
                runFullHideCheckDebounced(); // 使用防抖全量检查
            } else {
                 console.log(`${LOG_PREFIX} CHAT_CHANGED timeout: Plugin disabled. Skipping full check.`);
            }
        }, 500); // 增加延迟，给 ST 更多时间加载聊天内容和更新上下文
    });

    // 监听新消息事件 (发送和接收) - 使用增量检查可能不可靠，改为全量检查
    const handleNewMessage = (eventType) => {
         console.log(`${LOG_PREFIX} Event received: ${eventType}`);
         if (extension_settings[extensionName].enabled) {
             // 增量检查逻辑复杂且可能因ST内部状态不一致而出错
             // 改为触发防抖的全量检查，更稳妥
             console.log(`${LOG_PREFIX} New message event: Plugin enabled. Calling runFullHideCheckDebounced().`);
             runFullHideCheckDebounced();
             // 如果坚持用增量：
             // console.log(`${LOG_PREFIX} New message event: Plugin enabled. Calling runIncrementalHideCheck() after delay.`);
             // setTimeout(() => runIncrementalHideCheck(), 100); // 稍微延迟
         } else {
             // console.log(`${LOG_PREFIX} New message event: Plugin disabled. Skipping check.`); // 减少噪音
         }
    };
    eventSource.on(event_types.MESSAGE_RECEIVED, () => handleNewMessage(event_types.MESSAGE_RECEIVED));
    eventSource.on(event_types.MESSAGE_SENT, () => handleNewMessage(event_types.MESSAGE_SENT));


    // 监听消息删除事件
    eventSource.on(event_types.MESSAGE_DELETED, () => {
        console.log(`${LOG_PREFIX} Event received: ${event_types.MESSAGE_DELETED}`);
        if (extension_settings[extensionName].enabled) {
             console.log(`${LOG_PREFIX} Message deleted event: Plugin enabled. Calling runFullHideCheckDebounced().`);
            runFullHideCheckDebounced(); // 使用防抖全量检查
        } else {
            // console.log(`${LOG_PREFIX} Message deleted event: Plugin disabled. Skipping check.`); // 减少噪音
        }
    });

    // 监听流式响应结束事件 (非常重要，此时消息内容和数量稳定)
    // 注意：SillyTavern 可能没有统一的 STREAM_END 事件， MESSAGE_RECEIVED 可能在流式期间多次触发
    // 可能需要监听 GENERATION_ENDED 或者依赖 MESSAGE_RECEIVED/SENT 的防抖
    // 如果 GENERATION_ENDED 可用且在流结束后触发，会更好
     eventSource.on(event_types.GENERATION_ENDED, () => { // 假设有这个事件
         console.log(`${LOG_PREFIX} Event received: ${event_types.GENERATION_ENDED}`);
         if (extension_settings[extensionName].enabled) {
            console.log(`${LOG_PREFIX} Generation ended event: Plugin enabled. Calling runFullHideCheckDebounced().`);
            runFullHideCheckDebounced();
        } else {
            // console.log(`${LOG_PREFIX} Generation ended event: Plugin disabled. Skipping check.`); // 减少噪音
        }
     });
     // 如果没有 GENERATION_ENDED, MESSAGE_RECEIVED/SENT 的防抖是次优选择

    console.log(`${LOG_PREFIX} Event listeners setup complete.`);
}

// 初始化扩展
jQuery(async () => {
    console.log(`${LOG_PREFIX} Initializing extension...`);
    loadSettings(); // 加载全局启用状态
    createUI(); // 创建界面元素

    // 初始加载时更新显示并执行检查
    // 延迟执行以确保 SillyTavern 的上下文和其他扩展已准备好
    console.log(`${LOG_PREFIX} Scheduling initial check and UI update...`);
    setTimeout(() => {
         console.log(`${LOG_PREFIX} Initial timeout triggered. Performing initial setup...`);
         try {
             // 设置全局启用/禁用选择框的当前值
             const globalToggle = $('#hide-helper-toggle');
             if (globalToggle.length) {
                 globalToggle.val(extension_settings[extensionName].enabled ? 'enabled' : 'disabled');
                 console.log(`${LOG_PREFIX} Initial setup: Global toggle set to ${extension_settings[extensionName].enabled ? 'enabled' : 'disabled'}.`);
             } else {
                 console.warn(`${LOG_PREFIX} Initial setup: Global toggle #hide-helper-toggle not found.`);
             }

             // 更新当前设置显示和输入框 (如果 popup 打开时才可见)
             updateCurrentHideSettingsDisplay(); // 会打印日志

             // 初始加载时执行全量检查 (如果插件启用且当前角色/群组有用户配置)
             if (extension_settings[extensionName].enabled) {
                  console.log(`${LOG_PREFIX} Initial setup: Plugin enabled. Checking if initial full check is needed...`);
                 const initialSettings = getCurrentHideSettings(); // 会打印日志
                 if(initialSettings?.userConfigured === true) {
                     console.log(`${LOG_PREFIX} Initial setup: User configured settings found. Running initial full check.`);
                     runFullHideCheck(); // 首次加载直接运行，不用防抖
                 } else {
                      console.log(`${LOG_PREFIX} Initial setup: No user configured settings found for current context. Skipping initial full check.`);
                 }
             } else {
                  console.log(`${LOG_PREFIX} Initial setup: Plugin disabled. Skipping initial check.`);
             }
         } catch (error) {
             console.error(`${ERR_PREFIX} Error during initial setup timeout:`, error);
         }
         console.log(`${LOG_PREFIX} Initial setup complete.`);
    }, 2000); // 增加延迟时间 (2秒) 以确保 ST 完全加载
});
