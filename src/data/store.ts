// 数据层：localStorage 持久化 + 演示种子数据
// 工卡、工具、缺件挂签、版本链放在同一个 key 原子写入，保证刷新后一致

import type { Database } from "./types";

export const STORAGE_KEY = "hxwl-07-release-desk-v1";

export function seedDatabase(): Database {
  return {
    operator: "王工",
    seq: 5,
    tools: [
      {
        id: "TQ-2031",
        name: "预置式扭矩扳手",
        spec: "20–100 N·m",
        serial: "SN-2031",
        calibratedAt: "2026-07-01",
        calibrateDue: "2026-10-01",
        quarantine: false,
      },
      {
        id: "TQ-3350",
        name: "角度扭矩扳手",
        spec: "40–200 N·m",
        serial: "SN-3350",
        calibratedAt: "2026-06-15",
        calibrateDue: "2026-09-15",
        quarantine: false,
      },
      {
        id: "TQ-4472",
        name: "数显扭矩扳手",
        spec: "10–50 N·m",
        serial: "SN-4472",
        calibratedAt: "2026-08-10",
        calibrateDue: "2026-11-10",
        quarantine: false,
      },
      {
        id: "TQ-1187",
        name: "预置式扭矩扳手",
        spec: "80–340 N·m",
        serial: "SN-1187",
        calibratedAt: "2026-04-02",
        calibrateDue: "2026-07-02",
        quarantine: false,
      },
    ],
    cards: [
      {
        id: "WO-001",
        airframe: "B-9921",
        ata: "ATA 32 起落架",
        stand: "A12",
        start: "2026-09-22T09:00",
        end: "2026-09-22T17:00",
        status: "active",
        signer: null,
        signedAt: null,
        createdAt: "2026-09-20T10:00",
        updatedAt: "2026-09-21T15:30",
        loans: [
          {
            toolId: "TQ-2031",
            start: "2026-09-22T09:30",
            end: "2026-09-22T16:00",
            returnedAt: null,
            returnCalibrationOk: null,
            returnNote: "",
          },
        ],
        tags: [
          {
            id: "TAG-001",
            pn: "PN-451-3210",
            name: "主轮螺栓锁片",
            qty: 4,
            reason: "航材库无货，预计 09-23 到货",
            createdAt: "2026-09-21T15:30",
            resolvedAt: null,
            resolution: "",
          },
        ],
        versions: [],
      },
      {
        id: "WO-002",
        airframe: "B-6810",
        ata: "ATA 24 电源系统",
        stand: "B05",
        start: "2026-09-21T08:30",
        end: "2026-09-21T12:00",
        status: "signed",
        signer: "李放行",
        signedAt: "2026-09-21T13:02",
        createdAt: "2026-09-18T09:00",
        updatedAt: "2026-09-21T13:02",
        loans: [
          {
            toolId: "TQ-4472",
            start: "2026-09-21T08:30",
            end: "2026-09-21T11:30",
            returnedAt: "2026-09-21T11:20",
            returnCalibrationOk: true,
            returnNote: "封记完好",
          },
        ],
        tags: [],
        versions: [
          {
            version: 1,
            reason: "签署基线",
            createdBy: "李放行",
            createdAt: "2026-09-21T13:02",
            snapshot: {
              airframe: "B-6810",
              ata: "ATA 24 电源系统",
              stand: "B05",
              start: "2026-09-21T08:30",
              end: "2026-09-21T12:00",
              loans: [
                {
                  toolId: "TQ-4472",
                  start: "2026-09-21T08:30",
                  end: "2026-09-21T11:30",
                  returnedAt: "2026-09-21T11:20",
                  returnCalibrationOk: true,
                  returnNote: "封记完好",
                },
              ],
              tags: [],
            },
          },
        ],
      },
      {
        id: "WO-003",
        airframe: "B-9921",
        ata: "ATA 27 飞控",
        stand: "A12",
        start: "2026-09-22T10:00",
        end: "2026-09-22T15:30",
        status: "draft",
        signer: null,
        signedAt: null,
        createdAt: "2026-09-22T08:10",
        updatedAt: "2026-09-22T08:10",
        loans: [
          {
            toolId: "TQ-1187",
            start: "2026-09-22T10:00",
            end: "2026-09-22T12:00",
            returnedAt: null,
            returnCalibrationOk: null,
            returnNote: "",
          },
          {
            toolId: "TQ-2031",
            start: "2026-09-22T11:00",
            end: "2026-09-22T14:00",
            returnedAt: null,
            returnCalibrationOk: null,
            returnNote: "",
          },
        ],
        tags: [
          {
            id: "TAG-002",
            pn: "PN-271-8809",
            name: "副翼作动器密封件",
            qty: 1,
            reason: "作动测试复查发现渗漏，待密封件",
            createdAt: "2026-09-22T08:10",
            resolvedAt: null,
            resolution: "",
          },
        ],
        versions: [],
      },
      {
        id: "WO-004",
        airframe: "B-5207",
        ata: "ATA 28 燃油系统",
        stand: "C02",
        start: "2026-09-20T09:00",
        end: "2026-09-20T16:00",
        status: "closed",
        signer: "李放行",
        signedAt: "2026-09-19T17:30",
        createdAt: "2026-09-17T11:00",
        updatedAt: "2026-09-21T09:00",
        loans: [
          {
            toolId: "TQ-2031",
            start: "2026-09-20T09:00",
            end: "2026-09-20T15:30",
            returnedAt: "2026-09-20T15:20",
            returnCalibrationOk: true,
            returnNote: "封记完好，外观正常",
          },
        ],
        tags: [
          {
            id: "TAG-003",
            pn: "PN-280-1142",
            name: "燃油排放卡箍",
            qty: 2,
            reason: "例行检查发现卡箍老化",
            createdAt: "2026-09-18T09:00",
            resolvedAt: "2026-09-19T14:10",
            resolution: "航材到货并安装，复检无渗漏",
          },
        ],
        versions: [
          {
            version: 1,
            reason: "签署基线",
            createdBy: "李放行",
            createdAt: "2026-09-19T17:30",
            snapshot: {
              airframe: "B-5207",
              ata: "ATA 28 燃油系统",
              stand: "C02",
              start: "2026-09-20T09:00",
              end: "2026-09-20T16:00",
              loans: [
                {
                  toolId: "TQ-2031",
                  start: "2026-09-20T09:00",
                  end: "2026-09-20T15:30",
                  returnedAt: null,
                  returnCalibrationOk: null,
                  returnNote: "",
                },
              ],
              tags: [
                {
                  id: "TAG-003",
                  pn: "PN-280-1142",
                  name: "燃油排放卡箍",
                  qty: 2,
                  reason: "例行检查发现卡箍老化",
                  createdAt: "2026-09-18T09:00",
                  resolvedAt: "2026-09-19T14:10",
                  resolution: "航材到货并安装，复检无渗漏",
                },
              ],
            },
          },
          {
            version: 2,
            reason: "签署后补录：归还时间按工具房签收单补登",
            createdBy: "王工",
            createdAt: "2026-09-21T09:00",
            snapshot: {
              airframe: "B-5207",
              ata: "ATA 28 燃油系统",
              stand: "C02",
              start: "2026-09-20T09:00",
              end: "2026-09-20T16:00",
              loans: [
                {
                  toolId: "TQ-2031",
                  start: "2026-09-20T09:00",
                  end: "2026-09-20T15:30",
                  returnedAt: "2026-09-20T15:20",
                  returnCalibrationOk: true,
                  returnNote: "封记完好，外观正常",
                },
              ],
              tags: [
                {
                  id: "TAG-003",
                  pn: "PN-280-1142",
                  name: "燃油排放卡箍",
                  qty: 2,
                  reason: "例行检查发现卡箍老化",
                  createdAt: "2026-09-18T09:00",
                  resolvedAt: "2026-09-19T14:10",
                  resolution: "航材到货并安装，复检无渗漏",
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

export function loadDatabase(): Database {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedDatabase();
    const parsed = JSON.parse(raw) as Database;
    if (!parsed || !Array.isArray(parsed.cards) || !Array.isArray(parsed.tools)) {
      return seedDatabase();
    }
    return parsed;
  } catch {
    return seedDatabase();
  }
}

export function saveDatabase(db: Database): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}
