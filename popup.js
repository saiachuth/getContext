let floatingButton = null;
let popup = null;
let selectedText = "";

// Create and initialize popup
function createPopup(x, y) {
  removeExistingElements();

  popup = document.createElement("div");
  popup.className = "gpt-popup";
  
  // Position setup
  let left = Math.min(x, window.innerWidth - 320);
  let top = Math.min(y + 20, window.innerHeight - 200);
  
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  popup.style.position = "fixed";

  // Add content
  popup.innerHTML = `
    <button class="gpt-popup-close">×</button>
    <div class="gpt-popup-header">Ask about the selected text</div>
    <textarea class="gpt-popup-textarea" placeholder="Type your question here..." rows="3"></textarea>
    <button class="gpt-popup-button">Ask AI</button>
  `;

  document.body.appendChild(popup);

  // Drag functionality
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;

  const header = popup.querySelector(".gpt-popup-header");
  
  header.addEventListener("mousedown", (e) => {
    isDragging = true;
    initialX = e.clientX - popup.offsetLeft;
    initialY = e.clientY - popup.offsetTop;
    
    popup.style.cursor = "move";
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    
    e.preventDefault();
    currentX = e.clientX - initialX;
    currentY = e.clientY - initialY;

    // Boundary checks
    currentX = Math.max(0, Math.min(currentX, window.innerWidth - popup.offsetWidth));
    currentY = Math.max(0, Math.min(currentY, window.innerHeight - popup.offsetHeight));

    popup.style.left = `${currentX}px`;
    popup.style.top = `${currentY}px`;
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
    popup.style.cursor = "default";
  });

  // Rest of the popup functionality
  const closeBtn = popup.querySelector(".gpt-popup-close");
  const askBtn = popup.querySelector(".gpt-popup-button");
  const textarea = popup.querySelector(".gpt-popup-textarea");

  closeBtn.addEventListener("click", () => {
    removeExistingElements();
    removeHighlight();
  });

  askBtn.addEventListener("click", async () => {
    const question = textarea.value.trim();
    if (!question) return;

    const responseDiv = popup.querySelector(".gpt-response") || document.createElement("div");
    responseDiv.className = "gpt-response";
    responseDiv.innerHTML = '<div class="loading"></div>';

    if (!popup.contains(responseDiv)) {
      popup.appendChild(responseDiv);
    }

    try {
      // Check if we have selected text
      if (!selectedText) {
        throw new Error("No text selected. Please select text first.");
      }
      
      console.log("Selected text:", selectedText); // Debug log
      console.log("Question:", question); // Debug log
      
      const response = await askAI(selectedText, question);
      responseDiv.textContent = response;
    } catch (error) {
      responseDiv.textContent = "Error: " + error.message;
    }
  });

  setTimeout(() => textarea.focus(), 100);
  return popup;
}

function createFloatingButton(x, y) {
  removeExistingElements();

  floatingButton = document.createElement("button");
  floatingButton.className = "gpt-floating-button";
  floatingButton.innerHTML = "💡";
  floatingButton.style.left = `${x}px`;
  floatingButton.style.top = `${y}px`;

  floatingButton.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    createPopup(x, y);
  });

  document.body.appendChild(floatingButton);
}

function removeExistingElements() {
  if (popup) {
    const header = popup.querySelector(".gpt-popup-header");
    if (header) {
      header.removeEventListener("mousedown", null);
    }
    document.removeEventListener("mousemove", null);
    document.removeEventListener("mouseup", null);
    popup.remove();
    popup = null;
  }
  if (floatingButton) {
    floatingButton.remove();
    floatingButton = null;
  }
}

async function askAI(context, question) {
  const settings = await chrome.storage.sync.get([
    "modelProvider",
    "anthropicApiKey",
    "openaiApiKey",
    "arliApiKey",
  ]);

  const provider = settings.modelProvider || "claude";

  if (provider === "claude") {
    if (!settings.anthropicApiKey) {
      throw new Error(
        "Please set your Anthropic API key in the extension popup"
      );
    }
    return askClaude(context, question, settings.anthropicApiKey);
  } else if (provider === "arli") {
    if (!settings.arliApiKey) {
      throw new Error("Please set your Arli AI API key in the extension popup");
    }
    return askArli(context, question, settings.arliApiKey);
  } else {
    if (!settings.openaiApiKey) {
      throw new Error("Please set your OpenAI API key in the extension popup");
    }
    return askGPT(context, question, settings.openaiApiKey);
  }
}

async function askClaude(context, question, apiKey) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-opus-20240229",
      max_tokens: 150,
      messages: [
        {
          role: "user",
          content: `Context: "${context}"\n\nQuestion: ${question}`,
        },
      ],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      data.error?.message || "Failed to get response from Claude"
    );
  }

  return data.content[0].text;
}

async function askGPT(context, question, apiKey) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that provides concise and accurate information about user queries based on the given context.",
        },
        {
          role: "user",
          content: `Context: "${context}"\n\nQuestion: ${question}`,
        },
      ],
      max_tokens: 150,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "Failed to get response from GPT");
  }

  return data.choices[0].message.content;
}

async function askArli(context, question, apiKey) {
  const response = await fetch("https://api.arliai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "Meta-Llama-3.1-8B-Instruct",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that provides concise and accurate information about user queries based on the given context.",
        },
        {
          role: "user",
          content: `Context: "${context}"\n\nQuestion: ${question}`,
        },
      ],
      repetition_penalty: 1.1,
      temperature: 0.7,
      top_p: 0.9,
      top_k: 40,
      max_tokens: 150,
      stream: false,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      data.error?.message || "Failed to get response from Arli AI"
    );
  }

  return data.choices[0].message.content;
}

document.addEventListener("mouseup", (event) => {
  const selection = window.getSelection();
  if (selection) {
    selectedText = selection.toString().trim();
    
    if (selectedText && !event.target.closest(".gpt-popup")) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const x = rect.left + window.scrollX;
      const y = rect.top + window.scrollY;
      createFloatingButton(x, y);
    }
  }
});

document.addEventListener("mousedown", (event) => {
  if (
    !event.target.closest(".gpt-popup") &&
    !event.target.closest(".gpt-floating-button")
  ) {
    removeExistingElements();
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "showPopup" && request.text) {
    selectedText = request.text;
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    createPopup(rect.left + window.scrollX, rect.top + window.scrollY);
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const apiKeyInput = document.getElementById("apiKey");
  const modelSelect = document.getElementById("modelProvider");
  const saveButton = document.getElementById("saveKey");
  const messageDiv = document.createElement("div");

  messageDiv.className = "save-message";
  document.querySelector(".api-key-section").appendChild(messageDiv);

  // Load saved values
  chrome.storage.sync.get(
    ["modelProvider", "anthropicApiKey", "openaiApiKey", "arliApiKey"],
    (data) => {
      if (data.modelProvider) {
        modelSelect.value = data.modelProvider;
      }
      if (data.modelProvider === "claude" && data.anthropicApiKey) {
        apiKeyInput.value = data.anthropicApiKey;
      } else if (data.modelProvider === "openai" && data.openaiApiKey) {
        apiKeyInput.value = data.openaiApiKey;
      } else if (data.modelProvider === "arli" && data.arliApiKey) {
        apiKeyInput.value = data.arliApiKey;
      }
    }
  );

  saveButton.addEventListener("click", () => {
    const provider = modelSelect.value;
    const key = apiKeyInput.value.trim();

    if (!key) {
      messageDiv.textContent = "Please enter an API key";
      messageDiv.className = "save-message error";
      return;
    }

    const saveData = {
      modelProvider: provider,
    };

    if (provider === "claude") {
      saveData.anthropicApiKey = key;
    } else if (provider === "arli") {
      saveData.arliApiKey = key;
    } else {
      saveData.openaiApiKey = key;
    }

    chrome.storage.sync.set(saveData, () => {
      messageDiv.textContent = `${
        provider === "claude"
          ? "Claude"
          : provider === "arli"
          ? "Arli AI"
          : "OpenAI"
      } API key saved successfully!`;
      messageDiv.className = "save-message success";

      setTimeout(() => {
        messageDiv.textContent = "";
      }, 3000);
    });
  });

  modelSelect.addEventListener("change", () => {
    const provider = modelSelect.value;
    chrome.storage.sync.get(
      ["anthropicApiKey", "openaiApiKey", "arliApiKey"],
      (data) => {
        if (provider === "claude" && data.anthropicApiKey) {
          apiKeyInput.value = data.anthropicApiKey;
        } else if (provider === "openai" && data.openaiApiKey) {
          apiKeyInput.value = data.openaiApiKey;
        } else if (provider === "arli" && data.arliApiKey) {
          apiKeyInput.value = data.arliApiKey;
        } else {
          apiKeyInput.value = "";
        }
      }
    );
  });
});
