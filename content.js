let floatingButton = null;
let popup = null;
let selectedText = "";
let selectedRange = null;

function createHighlight(selection) {
  try {
    selectedRange = selection.getRangeAt(0).cloneRange();
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Create a single highlight overlay
    const highlight = document.createElement('div');
    highlight.className = 'text-highlight';
    highlight.style.position = 'absolute';
    highlight.style.left = `${rect.left + window.scrollX}px`;
    highlight.style.top = `${rect.top + window.scrollY}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;
    highlight.style.pointerEvents = 'none';
    
    document.body.appendChild(highlight);
    
    return rect;
  } catch (e) {
    console.error("Highlight error:", e);
    return selection.getRangeAt(0).getBoundingClientRect();
  }
}

function removeHighlight() {
  const highlights = document.querySelectorAll('.text-highlight');
  highlights.forEach(highlight => highlight.remove());
}

// Update the mouseup event listener
document.addEventListener("mouseup", (event) => {
  const selection = window.getSelection();
  if (selection && !event.target.closest(".gpt-popup")) {
    const text = selection.toString().trim();
    if (text) {
      selectedText = text;
      console.log("Text selected:", selectedText); // Debug log
      const rect = createHighlight(selection);
      const x = rect.left + window.scrollX;
      const y = rect.top + window.scrollY;
      createFloatingButton(x, y);
    }
  }
});

// Update the message listener for right-click
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "showPopup" && request.text) {
    selectedText = request.text;
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const rect = createHighlight(selection);
      const x = rect.left + window.scrollX;
      const y = rect.top + window.scrollY;

      // Add a small delay to ensure highlight is created before popup
      setTimeout(() => {
        createPopup(x, y);
      }, 50);
    }
  }
});

// Handle clicks outside
document.addEventListener("mousedown", (event) => {
  if (
    !event.target.closest(".gpt-popup") &&
    !event.target.closest(".gpt-floating-button")
  ) {
    removeHighlight();
    removeExistingElements();
  }
});

// Add this function if it's not already in content.js
function createPopup(x, y) {
  removeExistingElements();
  // Store the selected text immediately when creating popup
  const selection = window.getSelection();
  if (selection && selection.toString().trim()) {
    selectedText = selection.toString().trim();
  }

  popup = document.createElement("div");
  popup.className = "gpt-popup";

  popup.dataset.selectedText = selectedText;

  // Calculate position to keep popup within viewport
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const popupWidth = 320;
  const popupHeight = 200; // Approximate initial height

  let left = Math.min(Math.max(x, 10), viewportWidth - popupWidth - 10);
  let top = Math.min(Math.max(y, 10), viewportHeight - popupHeight - 10);

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;

  const content = `
    <button class="gpt-popup-close">×</button>
    <div class="gpt-popup-header">Ask AI Assistant</div>
    <textarea class="gpt-popup-textarea" placeholder="Ask a question about the selected text..." rows="3"></textarea>
    <button class="gpt-popup-button">Ask AI</button>
  `;

  popup.innerHTML = content;
  document.body.appendChild(popup);

  // Add dragging functionality
  const header = popup.querySelector(".gpt-popup-header");
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;

  header.addEventListener("mousedown", dragStart);
  document.addEventListener("mousemove", drag);
  document.addEventListener("mouseup", dragEnd);

  function dragStart(e) {
    initialX = e.clientX - popup.offsetLeft;
    initialY = e.clientY - popup.offsetTop;
    if (e.target === header) {
      isDragging = true;
    }
  }

  function drag(e) {
    if (isDragging) {
      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;

      // Keep popup within viewport bounds
      currentX = Math.min(
        Math.max(currentX, 0),
        viewportWidth - popup.offsetWidth
      );
      currentY = Math.min(
        Math.max(currentY, 0),
        viewportHeight - popup.offsetHeight
      );

      popup.style.left = `${currentX}px`;
      popup.style.top = `${currentY}px`;
    }
  }

  function dragEnd() {
    isDragging = false;
  }

  const closeBtn = popup.querySelector(".gpt-popup-close");
  const askBtn = popup.querySelector(".gpt-popup-button");
  const textarea = popup.querySelector(".gpt-popup-textarea");

  closeBtn.addEventListener("click", removeExistingElements);

  askBtn.addEventListener("click", async () => {
    const question = textarea.value.trim();
    if (!question) return;

    // Get the selected text from the popup's data attribute
    const popupSelectedText = popup.dataset.selectedText;

    const responseDiv =
      popup.querySelector(".gpt-response") || document.createElement("div");
    responseDiv.className = "gpt-response";
    responseDiv.innerHTML = '<div class="loading"></div>';

    if (!popup.contains(responseDiv)) {
      popup.appendChild(responseDiv);
    }

    try {
      if (!popupSelectedText) {
        throw new Error("No text selected. Please select some text first.");
      }

      console.log("Using selected text:", popupSelectedText); // Debug log
      const response = await askAI(popupSelectedText, question);
      responseDiv.textContent = response;
    } catch (error) {
      responseDiv.textContent = "Error: " + error.message;
      console.error("AI request error:", error);
    }
  });

  setTimeout(() => textarea.focus(), 100);
  return popup;
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

async function askArli(context, question, apiKey) {
  const response = await fetch("https://api.arliai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
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
