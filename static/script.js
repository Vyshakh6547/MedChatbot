const chatContainer = document.getElementById("chatContainer");
const userInput = document.getElementById("user_input");
const sendButton = document.getElementById("sendMessage");
const uploadAudioBtn = document.getElementById("uploadAudio");
const audioFile = document.getElementById("audioFile");
let mediaRecorder; // MediaRecorder instance
let audioChunks = []; // To store recorded audio chunks

// Button to start/stop recording
const recordButton = document.createElement("button");
recordButton.id = "recordButton";
recordButton.innerHTML = `<span class="material-symbols-rounded">mic</span>`;
recordButton.style.cursor = "pointer";
recordButton.style.fontSize = "24px";
recordButton.title = "Record Audio";
document.querySelector(".input-area").appendChild(recordButton);

// Append messages to the chat container
function appendMessage(content, type) {
  const messageElement = document.createElement("div");
  messageElement.className = type === "user" ? "user-message" : "bot-message";
  messageElement.textContent = content;
  chatContainer.appendChild(messageElement);
  chatContainer.scrollTop = chatContainer.scrollHeight; // Auto-scroll
}
// Send message when the send button is clicked
sendButton.addEventListener("click", async () => {
  const inputText = userInput.value.trim();
  if (!inputText) return;

  // Add user message to chat container
  appendMessage(inputText, "user");
  userInput.value = ""; // Clear input field

  // Add "Generating response..." animated bubble
  const generatingBubble = document.createElement("div");
  generatingBubble.className = "bot-message";
  generatingBubble.innerHTML = `
  <span class="dots">
    <span>.</span><span>.</span><span>.</span>
  </span>
`;
  generatingBubble.classList.add("animating");
  chatContainer.appendChild(generatingBubble);
  chatContainer.scrollTop = chatContainer.scrollHeight; // Auto-scroll

  try {
    // Fetch bot response with a timeout of 10 seconds
    const response = await Promise.race([
      fetch("/generate", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ user_input: inputText }),
      }),
      new Promise(
        (_, reject) =>
          setTimeout(
            () => reject(new Error("Timeout: Failed to generate response")),
            20000
          ) // 10-second timeout
      ),
    ]);

    if (!response.ok) {
      throw new Error("Failed to fetch response from the server.");
    }

    const data = await response.json();

    // Remove "Generating response..." bubble
    chatContainer.removeChild(generatingBubble);

    // Add bot response to chat container
    appendMessage(data.response_fine_tuned, "bot");
  } catch (error) {
    // Replace "Generating response..." text with an error message temporarily
    generatingBubble.textContent = "Failed to generate response.";

    // Remove the bubble after a short delay
    setTimeout(() => {
      chatContainer.removeChild(generatingBubble);
    }, 3000); // Remove the bubble after 3 seconds
  }
});

// Start/stop recording logic
recordButton.addEventListener("click", async () => {
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);

      audioChunks = [];
      mediaRecorder.start();
      const processingBubble = document.createElement("div");
      processingBubble.className = "bot-message";
      processingBubble.innerHTML = `
  <span>Recording audio</span>
  <span class="dots">
    <span>.</span><span>.</span><span>.</span>
  </span>
  <span> Press again to stop</span>
`;
      processingBubble.classList.add("animating");
      chatContainer.appendChild(processingBubble);
      chatContainer.scrollTop = chatContainer.scrollHeight; // Auto-scroll

      // Collect audio data as it's recorded
      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      // When recording stops, send the audio to the backend
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
        const formData = new FormData();
        formData.append("audio", audioBlob, "recording.wav");

        appendMessage("Processing audio...", "bot");

        try {
          const response = await fetch("/stt", {
            method: "POST",
            body: formData,
          });

          const data = await response.json();

          // Remove "Processing audio..." message
          const loadingMessages = document.querySelectorAll(".bot-message");
          if (loadingMessages.length > 0) {
            chatContainer.removeChild(
              loadingMessages[loadingMessages.length - 1]
            );
          }

          if (data.error) {
            chatContainer.removeChild(processingBubble);
            appendMessage(`Error: ${data.error}`, "bot");
          } else {
            chatContainer.removeChild(processingBubble);
            userInput.value = data.text; // Populate user input with transcribed text
            appendMessage(`Transcribed: "${data.text}"`, "bot"); // Display transcription
          }
        } catch (error) {
          chatContainer.removeChild(processingBubble);
          appendMessage(`Error: ${error.message}`, "bot");
        }
      };
    } catch (error) {
      appendMessage("Microphone access denied or unavailable.", "bot");
    }
  } else if (mediaRecorder.state === "recording") {
    mediaRecorder.stop(); // Stop recording
  }
});

// Convert Speech file to Text
uploadAudioBtn.addEventListener("click", () => {
  audioFile.click(); // Trigger the hidden file input
});

audioFile.addEventListener("change", async () => {
  if (audioFile.files.length > 0) {
    const formData = new FormData();
    formData.append("audio", audioFile.files[0]);

    try {
      const response = await fetch("/stt", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.error) {
        appendMessage(`Error: ${data.error}`, "bot");
      } else {
        userInput.value = data.text; // Populate user input with transcribed text
      }
    } catch (error) {
      appendMessage(`Error: ${error.message}`, "bot");
    }
  }
});

// Convert Text to Speech
const ttsBtn = document.getElementById("ttsBtn");
ttsBtn.addEventListener("click", async () => {
  const lastBotMessage = [
    ...chatContainer.getElementsByClassName("bot-message"),
  ].pop();
  if (!lastBotMessage) {
    alert("No response available to convert to speech.");
    return;
  }

  const text = lastBotMessage.textContent;
  try {
    const response = await fetch("/tts", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ text }),
    });

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audio.play();
  } catch (error) {
    appendMessage(`Error: ${error.message}`, "bot");
  }
});
