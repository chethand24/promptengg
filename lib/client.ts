"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Session } from "@/types";

export interface Packet {
  session: Session;
  revision: number;
  checkpoint?: string;
  remedialAvailable: boolean;
}

interface StudyStore {
  sessions: Record<string, Packet>;
  currentId?: string;
  save: (packet: Packet) => void;
  open: (id?: string) => void;
  rate: (id: string, rating: number) => void;
}

export const useStudy = create<StudyStore>()(persist((set) => ({
  sessions: {},
  save: packet => set(state => {
    const id = packet.session.problem.id;
    const existing = state.sessions[id]?.session;
    const rating = packet.session.finishedAt && packet.session.finishedAt === existing?.finishedAt ? existing?.rating : undefined;
    return { sessions: { ...state.sessions, [id]: { ...packet, session: { ...packet.session, rating } } }, currentId: id };
  }),
  open: currentId => set({ currentId }),
  rate: (id, rating) => set(state => {
    const packet = state.sessions[id];
    return packet ? { sessions: { ...state.sessions, [id]: { ...packet, session: { ...packet.session, rating } } } } : state;
  }),
}), { name: "stepwise-study-v1" }));

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function send<T extends Packet = Packet>(action: string, data: object): Promise<T> {
  try {
    const response = await fetch("/api/" + action, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) throw new ApiError(result.error, response.status);
    return result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("The tutor connection was interrupted. Try again.", 0);
  }
}

