import { useEffect, useState } from "react";
import { SEED } from "../data/seed";
import type { WorkshopState } from "../data/types";

// 数据层：唯一存储入口。所有读写都经过整份 WorkshopState，刷新后从 localStorage 还原。

const STORAGE_KEY = "hxwl-07-workshop-v1";

function load(): WorkshopState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(SEED);
    const parsed = JSON.parse(raw) as WorkshopState;
    if (parsed.storageVersion !== 1) return structuredClone(SEED);
    return parsed;
  } catch {
    return structuredClone(SEED);
  }
}

export function useWorkshop() {
  const [state, setState] = useState<WorkshopState>(load);
  const [savedAt, setSavedAt] = useState<string>(() => new Date().toISOString());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setSavedAt(new Date().toISOString());
  }, [state]);

  const resetSeed = () => setState(structuredClone(SEED));

  return { state, setState, savedAt, resetSeed };
}
