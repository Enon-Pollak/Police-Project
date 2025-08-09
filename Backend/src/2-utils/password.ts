export type PasswordCheck = { ok: boolean; reasons: string[] };

export function checkPasswordStrength(pw: string, email?: string, fullName?: string): PasswordCheck {
    const reasons: string[] = [];

    // Minimum length
    if (!pw || pw.length < 8) reasons.push("Must be at least 8 characters.");

    // Character diversity
    const hasLower = /[a-z]/.test(pw);
    const hasUpper = /[A-Z]/.test(pw);
    const hasDigit = /\d/.test(pw);
    const hasSymbol = /[^a-zA-Z0-9]/.test(pw);
    const diversity = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
    if (diversity < 3) reasons.push("Use at least 3 of: lowercase, uppercase, number, symbol.");

    // Common/guessable passwords
    const lowerPw = pw.toLowerCase();
    const bad = ["password", "12345678", "iloveyou", "qwerty", "11111111"];
    if (bad.some(b => lowerPw.includes(b))) reasons.push("Too common / guessable.");

    // Prevent using email/username
    if (email && lowerPw.includes(String(email).toLowerCase().split("@")[0]))
        reasons.push("Don't include your email/username.");

    // Prevent using parts of full name
    if (fullName && fullName.split(/\s+/).some(n => n && lowerPw.includes(n.toLowerCase())))
        reasons.push("Don't include your name.");

    return { ok: reasons.length === 0, reasons };
}
