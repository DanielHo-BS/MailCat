// --- Settings --- //
var BankList_Own = [];
var BankList_Url = "https://raw.githubusercontent.com/HeiTang/MailCat/main/bank_list.json";
var BankRule_Url = "https://raw.githubusercontent.com/HeiTang/MailCat/main/bank_rule.json";
// --- Settings --- //

// Lazy-loaded bank data (set by ensureBankDataLoaded, no fetch at script load).
var BankList_JSON = null;
var BankRule_JSON = null;

/**
 * Load bank list and rule once: retry URL, then backup (Cache/Properties), then embedded.
 * Call at the start of each bank function so we never depend on load-time fetch.
 */
function ensureBankDataLoaded() {
  if (BankList_JSON != null && BankRule_JSON != null) return;
  var data = getBankData(BankList_Url, BankRule_Url);
  BankList_JSON = data.list;
  BankRule_JSON = data.rule;
  if (data.source === "url") return;
  if (data.source === "backup") Logger.log("+ bank. 使用備援資料（上次成功）");
  else Logger.log("+ bank. 使用內嵌預設資料");
}

// 1. MailLabelManage
function Bank_Label() {
  ensureBankDataLoaded();
  for (var bankIndex = 0; bankIndex < BankList_Own.length; bankIndex++) {
    // 01. BankListLabel
    var isImportant = [0, 0, 0];
    var data_type = 1;
    var index = BankList_Own[bankIndex];
    var bank_label_name = BankList_JSON[index]['label_name'];
    var bank_email = BankList_JSON[index]['email'];

    // 檢查&建立標籤
    CheckLabel(bank_label_name); 
    // 銀行信件標記
    MarkLabel(bank_label_name, bank_email, data_type, isImportant[bankIndex]);

    // 02. BankRuleLabel // 0.登入通知 1.交易通知 2.電子帳單
    var isImportant = [0, 0, 1];
    data_type = 2;
    for (var ruleIndex = 0; ruleIndex < BankRule_JSON.length; ruleIndex++) {
      var label_name = BankRule_JSON[ruleIndex]['label_name'];
      var bank_rule = [Utilities.formatString("label:%s %s", bank_label_name , BankRule_JSON[ruleIndex]['rule'])];

      // 檢查&建立標籤
      CheckLabel(label_name); 
      // 特定信件標記
      MarkLabel(label_name, bank_rule, data_type, isImportant[ruleIndex]);
    }
  }
}

// 2. 定時刪除信件（登入通知）
function Bank_AutoRemove() {
  ensureBankDataLoaded();
  var delete_days = [7];
  var label_name = [BankRule_JSON[0]['label_name']];
  for (var i = 0; i < label_name.length; i++) {
    AutoRemove(delete_days[i], label_name[i]);
  }
}

// 3. 自動封存信件（登入通知、交易通知）
function Bank_AutoArchive() {
  ensureBankDataLoaded();
  var label_name = [BankRule_JSON[0]['label_name'], BankRule_JSON[1]['label_name']];
  for (var i = 0; i < label_name.length; i++) {
    AutoArchive(label_name[i]);
  }
}

// 4. 備份附件（電子帳單）
function Bank_AutoSave() {
  ensureBankDataLoaded();
  var folder_name = '銀行電子帳單';
  var label_name = BankRule_JSON[2]['label_name'];
  var rule = Utilities.formatString("has:attachment is:important label:%s", label_name);
  AutoSave(folder_name, label_name, rule);
}