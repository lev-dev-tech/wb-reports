const ReportVault = (() => {
  const SESSION_KEY = "wbReportKey";
  const fromBase64 = text => Uint8Array.from(atob(text), char => char.charCodeAt(0));

  async function deriveKey(password, sealed) {
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: fromBase64(sealed.salt), iterations: sealed.iterations, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      true,
      ["decrypt"],
    );
  }

  async function decryptWith(key, sealed) {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(sealed.iv) }, key, fromBase64(sealed.data));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  async function rememberForTab(key, sealed) {
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ salt: sealed.salt, key: btoa(String.fromCharCode(...raw)) }));
  }

  async function rememberedKey(sealed) {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    if (!saved || saved.salt !== sealed.salt) return null;
    return crypto.subtle.importKey("raw", fromBase64(saved.key), "AES-GCM", false, ["decrypt"]);
  }

  return {
    async load() {
      const response = await fetch("data.enc.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Данные еще не собраны");
      return response.json();
    },
    async unlock(password, sealed) {
      const key = await deriveKey(password, sealed);
      const data = await decryptWith(key, sealed);
      await rememberForTab(key, sealed);
      return data;
    },
    async unlockFromSession(sealed) {
      const key = await rememberedKey(sealed);
      return key ? decryptWith(key, sealed) : null;
    },
    forget() {
      sessionStorage.removeItem(SESSION_KEY);
    },
  };
})();
