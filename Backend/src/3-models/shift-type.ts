// src/3-models/shift-type.ts
export enum ShiftType {
    Boker = "בוקר",        // 06:30–15:00 or שילדי 06:30–19:00
    Tsohorayim = "צהריים", // 14:30–22:00
    Laila = "לילה",        // 21:30–07:00 or שילדי 18:30–07:00
    ShildiBoker = "שילדי בוקר",
    ShildiLaila = "שילדי לילה"
}
