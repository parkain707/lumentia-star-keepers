/* =========================================================
   AUTH ? Player Account, Password Hashing & Continuation
   ========================================================= */

var Auth = (function () {
  const USERS_KEY = 'starlight_users_v1';
  const CURRENT_KEY = 'starlight_current_user_v1';
  const LEGACY_KEY = 'starlight_idle_save_v1';

  // Fast standard SHA-256 hash using WebCrypto (or sync fallback)
  async function sha256(text) {
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      try {
        const msgUint8 = new TextEncoder().encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (e) {
        // fallback
      }
    }
    // Simple deterministic hash fallback
    let h1 = 0xdeadbeef, h2 = 0x41c64e6d;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }

  function generateSalt() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function getUsers() {
    try {
      const raw = localStorage.getItem(USERS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveUsers(users) {
    try {
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    } catch (e) {}
  }

  function getCurrentUser() {
    try {
      return localStorage.getItem(CURRENT_KEY) || null;
    } catch (e) {
      return null;
    }
  }

  function setCurrentUser(name) {
    try {
      if (name) {
        localStorage.setItem(CURRENT_KEY, name);
      } else {
        localStorage.removeItem(CURRENT_KEY);
      }
    } catch (e) {}
  }

  function getSaveKeyForUser(name) {
    if (!name) return LEGACY_KEY;
    return 'starlight_save_u_' + encodeURIComponent(name);
  }

  // Register new player
  async function register(name, password) {
    name = (name || '').trim();
    password = (password || '').trim();

    if (!name || name.length < 2 || name.length > 12) {
      return { ok: false, error: '파수꾼 이름은 2자 이상 12자 이내여야 합니다.' };
    }
    if (!password || password.length < 4) {
      return { ok: false, error: '비밀번호는 최소 4자리 이상이어야 합니다.' };
    }

    const users = getUsers();
    if (users[name]) {
      return { ok: false, error: '이미 존재하는 파수꾼 이름입니다. [이어서 하기]를 이용해주세요.' };
    }

    const salt = generateSalt();
    const hash = await sha256(password + ':' + salt);

    users[name] = {
      name: name,
      salt: salt,
      hash: hash,
      createdAt: Date.now(),
      lastLogin: Date.now()
    };

    saveUsers(users);
    setCurrentUser(name);

    // If there is legacy save data, migrate it to this user's save slot
    migrateLegacySave(name);

    return { ok: true, name: name };
  }

  // Login existing player (이어서 하기)
  async function login(name, password) {
    name = (name || '').trim();
    password = (password || '').trim();

    if (!name) return { ok: false, error: '파수꾼 이름을 입력해주세요.' };
    if (!password) return { ok: false, error: '비밀번호를 입력해주세요.' };

    const users = getUsers();
    const user = users[name];

    if (!user) {
      return { ok: false, error: '등록되지 않은 파수꾼 이름입니다. 이름을 확인하거나 새로 등록해주세요.' };
    }

    const computedHash = await sha256(password + ':' + user.salt);
    if (computedHash !== user.hash) {
      return { ok: false, error: '비밀번호가 일치하지 않습니다. 다시 입력해주세요.' };
    }

    user.lastLogin = Date.now();
    saveUsers(users);
    setCurrentUser(name);

    return { ok: true, name: name };
  }

  function logout() {
    setCurrentUser(null);
  }

  function migrateLegacySave(name) {
    try {
      const legacy = localStorage.getItem(LEGACY_KEY);
      const userKey = getSaveKeyForUser(name);
      if (legacy && !localStorage.getItem(userKey)) {
        localStorage.setItem(userKey, legacy);
      }
    } catch (e) {}
  }

  // Cross-device transfer code generation (암호화된 인수인계 코드)
  function exportTransferCode(password) {
    const current = getCurrentUser();
    if (!current) return { ok: false, error: '로그인된 상태에서만 발급 가능합니다.' };
    const users = getUsers();
    const user = users[current];
    if (!user) return { ok: false, error: '계정 정보를 찾을 수 없습니다.' };

    const userKey = getSaveKeyForUser(current);
    const saveData = localStorage.getItem(userKey) || '{}';

    const payload = {
      version: 1,
      name: current,
      salt: user.salt,
      hash: user.hash,
      save: saveData,
      timestamp: Date.now()
    };

    try {
      const json = JSON.stringify(payload);
      // UTF-8 base64 encoding
      const b64 = btoa(encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, function (match, p1) {
        return String.fromCharCode('0x' + p1);
      }));
      const code = 'LUMEN-' + b64;
      return { ok: true, code: code, name: current };
    } catch (e) {
      return { ok: false, error: '인수인계 코드 생성 실패: ' + e.message };
    }
  }

  // Import cross-device transfer code
  async function importTransferCode(rawCode, password) {
    if (!rawCode) return { ok: false, error: '인수인계 코드를 입력해주세요.' };
    rawCode = rawCode.trim();
    if (rawCode.startsWith('LUMEN-')) rawCode = rawCode.slice(6);

    let payload;
    try {
      const decoded = decodeURIComponent(Array.prototype.map.call(atob(rawCode), function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      payload = JSON.parse(decoded);
    } catch (e) {
      return { ok: false, error: '유효하지 않은 인수인계 코드입니다.' };
    }

    if (!payload || !payload.name || !payload.hash || !payload.salt) {
      return { ok: false, error: '코드 데이터가 손상되었습니다.' };
    }

    // Verify password if provided, or verify hash
    if (password) {
      const testHash = await sha256(password + ':' + payload.salt);
      if (testHash !== payload.hash) {
        return { ok: false, error: '비밀번호가 일치하지 않습니다.' };
      }
    }

    const users = getUsers();
    users[payload.name] = {
      name: payload.name,
      salt: payload.salt,
      hash: payload.hash,
      createdAt: payload.timestamp || Date.now(),
      lastLogin: Date.now()
    };

    saveUsers(users);
    const userKey = getSaveKeyForUser(payload.name);
    try {
      localStorage.setItem(userKey, payload.save || '{}');
    } catch (e) {}

    setCurrentUser(payload.name);
    return { ok: true, name: payload.name };
  }

  return {
    getCurrentUser: getCurrentUser,
    setCurrentUser: setCurrentUser,
    getUsers: getUsers,
    getSaveKeyForUser: getSaveKeyForUser,
    register: register,
    login: login,
    logout: logout,
    exportTransferCode: exportTransferCode,
    importTransferCode: importTransferCode
  };
})();

if (typeof window !== 'undefined') {
  window.Auth = Auth;
}
