// file: lib/stores/studentStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface StudentInfo {
  name:          string | null;
  email:         string | null;
  studentId:     string | null;
  major:         string | null;
  secondMajor:   string | null;
  minor:         string | null;
  concentration: string | null;
  year:          number | null;
  catalogYear:   number | null;
  advisor:       string | null;
}

interface StudentStore extends StudentInfo {
  setStudent: (info: Partial<StudentInfo>) => void;
  clear:      () => void;
}

const EMPTY: StudentInfo = {
  name:          null,
  email:         null,
  studentId:     null,
  major:         null,
  secondMajor:   null,
  minor:         null,
  concentration: null,
  year:          null,
  catalogYear:   null,
  advisor:       null,
};

export const useStudentStore = create<StudentStore>()(
  persist(
    (set) => ({
      ...EMPTY,
      setStudent: (info) => set((s) => ({ ...s, ...info })),
      clear:      ()     => set(EMPTY),
    }),
    { name: "wm-student" }
  )
);
