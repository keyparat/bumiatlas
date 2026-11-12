const endpoint = "https://bumiatlas.com/mcp/parcels";
const copyButton = document.getElementById("copyButton");

if (copyButton) {
  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(endpoint);
      const originalText = copyButton.textContent;
      copyButton.textContent = "Copied";
      copyButton.disabled = true;

      setTimeout(() => {
        copyButton.textContent = originalText;
        copyButton.disabled = false;
      }, 1400);
    } catch (error) {
      const textArea = document.createElement("textarea");
      textArea.value = endpoint;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);

      const originalText = copyButton.textContent;
      copyButton.textContent = "Copied";
      copyButton.disabled = true;

      setTimeout(() => {
        copyButton.textContent = originalText;
        copyButton.disabled = false;
      }, 1400);
    }
  });
}
