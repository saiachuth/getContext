let floatingButton = null;
let popup = null;
let selectedText = "";

// Create and initialize popup
function createPopup(x, y) {
  // Remove any existing popups first
  removeExistingElements();

  popup = document.createElement("div");
  popup.className = "gpt-popup";

  // Set initial position
  const rect = {
    right: window.innerWidth,
    bottom: window.innerHeight,
  };

  // Calculate position to ensure popup stays in viewport
  let left = Math.min(x, rect.right - 320); // 320px = popup width + padding
  let top = Math.min(y + 20, rect.bottom - 200); // 200px = approximate max height

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;

  // Create popup content
  const content = `
    <button class="gpt-popup-close">×</button>
    <div class="gpt-popup-header">Ask about the selected text</div>
    <textarea class="gpt-popup-textarea" placeholder="Type your question here..." rows="3"></textarea>
    <button class="gpt-popup-button">Ask GPT</button>
  `;

  popup.innerHTML = content;
  document.body.appendChild(popup);

  // Add event listeners
  const closeBtn = popup.querySelector(".gpt-popup-close");
  const askBtn = popup.querySelector(".gpt-popup-button");
  const textarea = popup.querySelector(".gpt-popup-textarea");

  closeBtn.addEventListener("click", removeExistingElements);

  askBtn.addEventListener("click", async () => {
    const question = textarea.value.trim();
    if (!question) return;

    const responseDiv =
      popup.querySelector(".gpt-response") || document.createElement("div");
    responseDiv.className = "gpt-response";
    responseDiv.innerHTML = '<div class="loading"></div>';

    if (!popup.contains(responseDiv)) {
      popup.appendChild(responseDiv);
    }

    try {
      const response = await askGPT(selectedText, question);
      responseDiv.textContent = response;
    } catch (error) {
      responseDiv.textContent = "Error: " + error.message;
    }
  });

  // Focus the textarea
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
    popup.remove();
    popup = null;
  }
  if (floatingButton) {
    floatingButton.remove();
    floatingButton = null;
  }
}

async function askGPT(context, question) {
  try {
    const apiKey = await chrome.storage.sync.get([
      "modelProvider",
      "anthropicApiKey",
      "openaiApiKey",
      "arliApiKey",
    ]);
    const modelProvider = apiKey.modelProvider || "claude";

    if (modelProvider === "claude") {
      if (!apiKey.anthropicApiKey) {
        throw new Error(
          "Please set your Anthropic API key in the extension popup"
        );
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey.anthropicApiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-sonnet-20240229",
          messages: [
            {
              role: "user",
              content: `Context: "${context}"\n\nQuestion: ${question}`,
            },
          ],
          max_tokens: 150,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error?.message || `Claude API error: ${response.status}`
        );
      }

      const data = await response.json();
      return data.content[0].text;
    } else if (modelProvider === "arli") {
      if (!apiKey.arliApiKey) {
        throw new Error(
          "Please set your Arli AI API key in the extension popup"
        );
      }
      const response = await fetch(
        "https://api.arliai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey.arliApiKey}`,
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
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error?.message || `Arli AI API error: ${response.status}`
        );
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } else {
      if (!apiKey.openaiApiKey) {
        throw new Error(
          "Please set your OpenAI API key in the extension popup"
        );
      }

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey.openaiApiKey}`,
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
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error?.message || `OpenAI API error: ${response.status}`
        );
      }

      const data = await response.json();
      return data.choices[0].message.content;
    }
  } catch (error) {
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      throw new Error("Network error: Please check your internet connection");
    }
    throw error;
  }
}

// Handle text selection
document.addEventListener("mouseup", (event) => {
  // Ignore if clicking inside the popup
  if (event.target.closest(".gpt-popup")) {
    return;
  }

  const selection = window.getSelection();
  const text = selection.toString().trim();

  // Only show floating button if there's a valid selection
  if (text.length > 0) {
    selectedText = text;
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const x = rect.left + window.scrollX;
    const y = rect.top + window.scrollY;
    createFloatingButton(x, y);
  } else {
    removeExistingElements();
  }
});

// Add click handler for document to remove elements when clicking outside
document.addEventListener("click", (event) => {
  if (
    !event.target.closest(".gpt-popup") &&
    !event.target.closest(".gpt-floating-button")
  ) {
    removeExistingElements();
  }
});

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "showPopup" && request.text) {
    selectedText = request.text;
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    createPopup(rect.left + window.scrollX, rect.top + window.scrollY);
  }
});
