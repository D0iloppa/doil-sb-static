class AppState {
    constructor() {
        this.isKorean = true;
        this.currentLuckMode = 'basic'; // basic, daehan, yunyeon, sohan, yuwol
        this.currentResult = null;
        this.selectedPalaceIndex = -1;

        // 대한 (Daehan) State
        this.daehan = {
            index: -1,
            locked: false
        };

        // 유년 (Yunyeon) State
        this.yunyeon = {
            age: -1,
            palaceIndex: -1,
            locked: false,
            yearZhi: null
        };

        // 소한 (Sohan) State
        this.sohan = {
            age: -1,
            palaceIndex: -1,
            locked: false
        };

        // 유월 (Yuwol) State
        this.yuwol = {
            age: -1,
            palaceIndex: -1,
            locked: false,
            yearZhi: null
        };

        // --- New Feature: Privacy Mode ---
        this.isPrivacyMode = false;
    }

    // ========== Reset Methods ==========

    resetMode(mode) {
        this.selectedPalaceIndex = -1;

        if (mode === 'daehan') {
            this.daehan = { index: -1, locked: false };
            this.yunyeon = { age: -1, palaceIndex: -1, locked: false, yearZhi: null };
            this.sohan = { age: -1, palaceIndex: -1, locked: false };
            this.yuwol = { age: -1, palaceIndex: -1, locked: false, yearZhi: null };
        } else if (mode === 'yunyeon') {
            // 대한 상태는 유지, 유년/소한/유월만 초기화
            this.yunyeon = { age: -1, palaceIndex: -1, locked: false, yearZhi: null };
            this.sohan = { age: -1, palaceIndex: -1, locked: false };
            this.yuwol = { age: -1, palaceIndex: -1, locked: false, yearZhi: null };
        } else if (mode === 'sohan') {
            // 대한 상태는 유지, 유년/소한/유월만 초기화
            this.yunyeon = { age: -1, palaceIndex: -1, locked: false, yearZhi: null };
            this.sohan = { age: -1, palaceIndex: -1, locked: false };
        } else if (mode === 'yuwol') {
            this.yuwol = { age: -1, palaceIndex: -1, locked: false, yearZhi: null };
        } else if (mode === 'basic') {
            this.resetAll();
        }
    }

    resetAll() {
        this.currentLuckMode = 'basic';
        this.selectedPalaceIndex = -1;
        this.daehan = { index: -1, locked: false };
        this.yunyeon = { age: -1, palaceIndex: -1, locked: false, yearZhi: null };
        this.sohan = { age: -1, palaceIndex: -1, locked: false };
        this.yuwol = { age: -1, palaceIndex: -1, locked: false, yearZhi: null };
    }

    // ========== Getters & Setters ==========

    // General
    setKorean(isKorean) { this.isKorean = isKorean; }

    // Privacy Mode Accessors
    togglePrivacyMode() { this.isPrivacyMode = !this.isPrivacyMode; return this.isPrivacyMode; }
    getIsPrivacyMode() { return this.isPrivacyMode; }

    // Daehan
    getDaehanIndex() { return this.daehan.index; }
    setDaehanIndex(index) { this.daehan.index = index; }
    isDaehanLocked() { return this.daehan.locked; }
    lockDaehan() { this.daehan.locked = true; }
    unlockDaehan() { this.daehan.locked = false; }

    // Yunyeon
    getYunyeonAge() { return this.yunyeon.age; }
    setYunyeonAge(age) { this.yunyeon.age = age; }
    getYunyeonPalaceIndex() { return this.yunyeon.palaceIndex; }
    setYunyeonPalaceIndex(index) { this.yunyeon.palaceIndex = index; }
    isYunyeonLocked() { return this.yunyeon.locked; }
    lockYunyeon() { this.yunyeon.locked = true; }
    unlockYunyeon() { this.yunyeon.locked = false; }
    getYunyeonYearZhi() { return this.yunyeon.yearZhi; }
    setYunyeonYearZhi(zhi) { this.yunyeon.yearZhi = zhi; }

    // Sohan
    getSohanAge() { return this.sohan.age; }
    setSohanAge(age) { this.sohan.age = age; }
    getSohanPalaceIndex() { return this.sohan.palaceIndex; }
    setSohanPalaceIndex(index) { this.sohan.palaceIndex = index; }
    isSohanLocked() { return this.sohan.locked; }
    lockSohan() { this.sohan.locked = true; }
    unlockSohan() { this.sohan.locked = false; }

    // Yuwol
    getYuwolAge() { return this.yuwol.age; }
    setYuwolAge(age) { this.yuwol.age = age; }
    getYuwolPalaceIndex() { return this.yuwol.palaceIndex; }
    setYuwolPalaceIndex(index) { this.yuwol.palaceIndex = index; }
    isYuwolLocked() { return this.yuwol.locked; }
    lockYuwol() { this.yuwol.locked = true; }
    unlockYuwol() { this.yuwol.locked = false; }
    getYuwolYearZhi() { return this.yuwol.yearZhi; }
    setYuwolYearZhi(zhi) { this.yuwol.yearZhi = zhi; }
}

const appState = new AppState();
