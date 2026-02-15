// --- Bank data: backup (Cache + Script Properties) and embedded fallback --- //

// Single key names used for both Cache and Script Properties.
var BANK_BACKUP_KEY_LIST = "MailCat_bank_list";
var BANK_BACKUP_KEY_RULE = "MailCat_bank_rule";
// Cache TTL: 7 days (seconds)
var BANK_BACKUP_CACHE_TTL = 7 * 24 * 60 * 60;
// Default retry options for URL fetch (used by getBankData).
var BANK_RETRY_OPTIONS = { maxAttempts: 3, delaySeconds: 2 };

/** Minimum rule entries required (bank.gs uses [0], [1], [2]). */
var BANK_RULE_MIN_LENGTH = 3;

/**
 * Check that list/rule have the shape expected by bank.gs. Reject wrong type or schema change.
 * @returns {boolean} true if both are valid for use.
 */
function isValidBankData(listJson, ruleJson) {
  if (listJson == null || ruleJson == null) return false;
  // List must be object keyed by bank code (e.g. "007"), not array.
  if (typeof listJson !== "object" || Array.isArray(listJson)) return false;
  var firstKey = Object.keys(listJson)[0];
  if (!firstKey || !listJson[firstKey] || typeof listJson[firstKey].label_name === "undefined" || !Array.isArray(listJson[firstKey].email)) return false;
  // Rule must be array with at least BANK_RULE_MIN_LENGTH entries (Bank_AutoRemove/Archive/Save use [0],[1],[2]).
  if (!Array.isArray(ruleJson) || ruleJson.length < BANK_RULE_MIN_LENGTH) return false;
  var firstRule = ruleJson[0];
  if (!firstRule || typeof firstRule.label_name === "undefined" || typeof firstRule.rule === "undefined") return false;
  return true;
}

/**
 * Save bank list and rule JSON to backup stores (Cache + Script Properties).
 * Only saves when data passes isValidBankData so we never persist wrong type/schema.
 * @param {Object} listJson - Parsed bank list object (keyed by bank code).
 * @param {Array} ruleJson - Parsed bank rule array.
 */
function saveBankDataBackup(listJson, ruleJson) {
  if (!isValidBankData(listJson, ruleJson)) return;
  var listStr = JSON.stringify(listJson);
  var ruleStr = JSON.stringify(ruleJson);
  try {
    var cache = CacheService.getScriptCache();
    cache.put(BANK_BACKUP_KEY_LIST, listStr, BANK_BACKUP_CACHE_TTL);
    cache.put(BANK_BACKUP_KEY_RULE, ruleStr, BANK_BACKUP_CACHE_TTL);
  } catch (e) {
    Logger.log("- bank_data. 寫入 Cache 失敗: %s", e.message);
  }
  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty(BANK_BACKUP_KEY_LIST, listStr);
    props.setProperty(BANK_BACKUP_KEY_RULE, ruleStr);
  } catch (e) {
    Logger.log("- bank_data. 寫入 Script Properties 失敗: %s", e.message);
  }
}

/**
 * Load bank list and rule from backup (Cache first, then Script Properties).
 * @returns {{ list: Object|null, rule: Array|null }}
 */
function loadBankDataFromBackup() {
  var listStr = null;
  var ruleStr = null;
  try {
    var cache = CacheService.getScriptCache();
    listStr = cache.get(BANK_BACKUP_KEY_LIST);
    ruleStr = cache.get(BANK_BACKUP_KEY_RULE);
  } catch (e) {
    Logger.log("- bank_data. 讀取 Cache 失敗: %s", e.message);
  }
  if (!listStr || !ruleStr) {
    try {
      var props = PropertiesService.getScriptProperties();
      if (!listStr) listStr = props.getProperty(BANK_BACKUP_KEY_LIST);
      if (!ruleStr) ruleStr = props.getProperty(BANK_BACKUP_KEY_RULE);
    } catch (e) {
      Logger.log("- bank_data. 讀取 Script Properties 失敗: %s", e.message);
    }
  }
  var list = null;
  var rule = null;
  if (listStr && listStr.length > 0) {
    try {
      list = JSON.parse(listStr);
    } catch (e) {
      Logger.log("- bank_data. 解析 backup list 失敗: %s", e.message);
    }
  }
  if (ruleStr && ruleStr.length > 0) {
    try {
      rule = JSON.parse(ruleStr);
    } catch (e) {
      Logger.log("- bank_data. 解析 backup rule 失敗: %s", e.message);
    }
  }
  if (!isValidBankData(list, rule)) {
    Logger.log("- bank_data. 備援資料格式不符，略過");
    return { list: null, rule: null };
  }
  return { list: list, rule: rule };
}

/**
 * Load bank list and rule from URL -> backup -> embedded. Single pipeline for all sources.
 * @param {string} listUrl - URL for bank list JSON.
 * @param {string} ruleUrl - URL for bank rule JSON.
 * @returns {{ list: Object, rule: Array, source: string }} source is "url" | "backup" | "embedded"
 */
function getBankData(listUrl, ruleUrl) {
  var list = GetJSONWithRetry(listUrl, BANK_RETRY_OPTIONS);
  var rule = GetJSONWithRetry(ruleUrl, BANK_RETRY_OPTIONS);
  if (isValidBankData(list, rule)) {
    saveBankDataBackup(list, rule);
    return { list: list, rule: rule, source: "url" };
  }
  if (list != null || rule != null) {
    Logger.log("- bank_data. 遠端資料格式不符或類型錯誤，改用備援/內嵌");
  }
  var backup = loadBankDataFromBackup();
  if (backup.list != null && backup.rule != null) {
    return { list: backup.list, rule: backup.rule, source: "backup" };
  }
  var embedded = getEmbeddedBankData();
  return { list: embedded.list, rule: embedded.rule, source: "embedded" };
}

/**
 * Embedded default bank list JSON (same as bank_list.json). Final fallback when URL and backup fail.
 */
function _getEmbeddedBankListStr() {
  return '{"108":{"name":"陽信銀行","label_name":"銀行/108 陽信銀行","domain_name":"sunnybank","email":["sunnybank.com.tw"]},"391":{"name":"iPASS MONEY","label_name":"電子支付/391 iPASS MONEY","domain_name":"i-pass","email":["i-pass.com.tw"]},"397":{"name":"歐付寶 O\'Pay","label_name":"電子支付/397 歐付寶 O\'Pay","domain_name":"opay","email":["opay.tw"]},"700":{"name":"中華郵政","label_name":"銀行/700 中華郵政","domain_name":"post","email":["post.gov.tw"]},"803":{"name":"聯邦銀行","label_name":"銀行/803 聯邦銀行","domain_name":"ubot","email":["ubot.com.tw"]},"805":{"name":"遠東銀行","label_name":"銀行/805 遠東銀行","domain_name":"feib","email":["feib.com.tw"]},"807":{"name":"永豐銀行","label_name":"銀行/807 永豐銀行","domain_name":"sinopac","email":["sinopac.com","banksinopac.com.tw","sinotrade.com.tw"]},"808":{"name":"玉山銀行","label_name":"銀行/808 玉山銀行","domain_name":"esunbank","email":["esunbank.com.tw","esunbank.com"]},"810":{"name":"星展銀行","english_name":"DBS Bank","label_name":"銀行/810 星展銀行","domain_name":"dbs","email":["dbs.com"]},"812":{"name":"台新銀行","label_name":"銀行/812 台新銀行","domain_name":"taishinbank","email":["richart.tw","taishinbank.com.tw"]},"822":{"name":"中國信託","label_name":"銀行/822 中國信託","domain_name":"ctbcbank","email":["ctbcbank.com"]},"823":{"name":"將來銀行","label_name":"銀行/823 將來銀行","domain_name":"nextbank","email":["nextbank.com.tw"]},"824":{"name":"連線銀行","label_name":"銀行/824 連線銀行","domain_name":"linebank","email":["linebank.com.tw"]},"007":{"name":"第一銀行","label_name":"銀行/007 第一銀行","domain_name":"firstbank","email":["firstbank.com.tw","firstbank.tw"]},"008":{"name":"華南銀行","label_name":"銀行/008 華南銀行","domain_name":"hncb","email":["hncb.com.tw"]},"009":{"name":"彰化銀行","label_name":"銀行/009 彰化銀行","domain_name":"chb","email":["chb.com.tw"]},"012":{"name":"台北富邦銀行","label_name":"銀行/012 富邦銀行","domain_name":"taipeifubon","email":["taipeifubon.com.tw","fubon.com"]},"013":{"name":"國泰世華","label_name":"銀行/013 國泰世華","domain_name":"cathaybk","email":["cathaybk.com.tw","cathaysec.com.tw","mybank.com.tw"]},"017":{"name":"兆豐銀行","label_name":"銀行/017 兆豐銀行","domain_name":"megabank","email":["megabank.com.tw"]},"048":{"name":"王道銀行","label_name":"銀行/048 王道銀行","domain_name":"o-bank","email":["o-bank.com"]},"053":{"name":"台中銀行","label_name":"銀行/053 台中銀行","domain_name":"tcbbank","email":["tcbbank.com.tw"]},"081":{"name":"匯豐銀行","label_name":"銀行/081 匯豐銀行","domain_name":"hsbc","email":["hsbc.com.tw"]},"000":{"name":"PayPal","label_name":"銀行/000 PayPal","domain_name":"paypal","email":["paypal.com"]}}';
}

/**
 * Embedded default bank rule JSON (same as bank_rule.json). Final fallback.
 */
function _getEmbeddedBankRuleStr() {
  return '[{"name":"0.登入通知","label_name":"銀行/0.登入通知","rule":["subject:({(\\"登入\\" \\"{成功 失敗 安全性 通知 交易 快速 會員}\") \\"密碼錯誤\\"})"]},{"name":"1.交易通知","label_name":"銀行/1.交易通知","rule":["subject:(-{\\"登入\\"} {\\"交易{{結果 成功 訊息 即時 儲值 轉帳 扣帳結果}通知 扣款 提領 成功 失敗 記錄}\\" \\"{付款成功 入帳 繳款 繳費 消費 提領 交易 轉帳 新股申購 {消費 繳款入帳}彙整 目標儲蓄當日成功/失敗}通知\\" \\"成交回報\\" \\"ATM{提款 提領}\\"})"]},{"name":"2.電子帳單","label_name":"銀行/2.電子帳單","rule":["subject:({\\"帳戶月結單\\" \\"{對 電子 信用卡}帳單\\"} -{繳款通知 入帳通知})"]}]';
}

/**
 * Return embedded default bank list and rule (final fallback when URL and backup fail).
 * @returns {{ list: Object, rule: Array }}
 */
function getEmbeddedBankData() {
  var list = JSON.parse(_getEmbeddedBankListStr());
  var rule = JSON.parse(_getEmbeddedBankRuleStr());
  return { list: list, rule: rule };
}
