// Chapter starts follow tutorial-videos/*/timing.json (scene start + the 0.6s push transition).
export type TutorialChapter = { at: number; title: string; summary: string };
export type Tutorial = { id: string; title: string; audience: string; src: string; poster: string; captions: string; duration: string; adminOnly: boolean; chapters: TutorialChapter[] };

export const tutorials: Tutorial[] = [
  {
    id: "unit", title: "單位成員與單位管理員篇", audience: "單位成員、單位管理員", duration: "4:52", adminOnly: false,
    src: "/tutorials/dns-unit-guide.mp4", poster: "/tutorials/dns-unit-guide.jpg", captions: "/tutorials/dns-unit-guide.vtt",
    chapters: [
      { at: 28, title: "登入與畫面導覽", summary: "以學校帳號登入，認識日常作業與申請作業兩組選單、目前單位與角色。" },
      { at: 58, title: "查看單位 DNS", summary: "列出本單位生效中的紀錄與清查活動公告，可依名稱、類型、內容或用途搜尋。" },
      { at: 77, title: "完成 DNS 清查", summary: "在紀錄點「清查」，更新聯絡資料、寫下清查備註後按「儲存並記錄清查」。" },
      { at: 107, title: "申請新增 DNS", summary: "填寫申請人資料，再依序填類型、名稱、網域、解析內容與用途；核准前不會變更 DNS。" },
      { at: 152, title: "DNS 歸屬申請", summary: "既有但尚未歸屬的 DNS 可依類型、名稱、網域申請納入本單位；核准後只改歸屬，不改解析內容。" },
      { at: 189, title: "申請變更或刪除", summary: "在紀錄點「申請變更」或「申請刪除」並寫明原因，經管理員核准才生效。" },
      { at: 215, title: "追蹤申請紀錄", summary: "查看本人與單位的申請狀態及管理員的審核回覆。" },
      { at: 234, title: "單位管理員：管理成員", summary: "在「單位管理」以學號新增使用者、調整角色或移出成員，單位至少保留一位管理員。" },
    ],
  },
  {
    id: "admin", title: "系統管理員篇", audience: "系統管理員", duration: "6:15", adminOnly: true,
    src: "/tutorials/dns-admin-guide.mp4", poster: "/tutorials/dns-admin-guide.jpg", captions: "/tutorials/dns-admin-guide.vtt",
    chapters: [
      { at: 24, title: "登入與後台導覽", summary: "系統範圍涵蓋全部單位與網域；選單分為日常、申請、審核與系統設定四組。" },
      { at: 57, title: "審核 DNS 申請", summary: "依狀態分頁審核；核准即套用 DNS，歸屬申請核准後只改歸屬，不核准時寫明原因。" },
      { at: 121, title: "DNS 管理與歸屬", summary: "依網域檢視紀錄，以「歸屬」指派單位、直接新增紀錄、查看歷程與匯出 CSV。" },
      { at: 177, title: "申請規則", summary: "設定僅限系統管理員申請的 DNS 類型；所有網域皆開放，PTR 只列反解網域。" },
      { at: 210, title: "單位管理", summary: "建立單位並以學號指定管理人，管理單位名稱與使用者。" },
      { at: 242, title: "刪除保護與清查活動", summary: "刪除 DNS 須輸入刪除保護密碼；清查活動公告清查期間。" },
      { at: 271, title: "郵件服務", summary: "設定通知信、依情境編輯郵件模板、寄信給單位並查看寄送紀錄。" },
      { at: 309, title: "帳號管理", summary: "搜尋帳號，調整備註、角色與帳號狀態。" },
      { at: 330, title: "操作紀錄", summary: "查閱所有登入、申請、審核與 DNS 變更，展開可看變更前後內容。" },
    ],
  },
];

export const formatTimestamp = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
