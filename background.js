chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "askAI",
    title: 'Ask AI about "%s"',
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "askAI") {
    chrome.tabs.sendMessage(tab.id, {
      action: "showPopup",
      text: info.selectionText,
    });
  }
});
