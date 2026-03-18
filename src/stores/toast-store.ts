"use client";

import { create } from "zustand";

export type ToastVariant = "default" | "success" | "error";

export interface ToastItem {
    id: string;
    title: string;
    description?: string;
    variant: ToastVariant;
}

interface ToastState {
    toasts: ToastItem[];
    pushToast: (toast: Omit<ToastItem, "id">) => void;
    dismissToast: (id: string) => void;
}

export const useToastStore = create<ToastState>()((set) => ({
    toasts: [],
    pushToast: (toast) => {
        const id =
            typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

        set((state) => ({
            toasts: [...state.toasts, { ...toast, id }],
        }));

        setTimeout(() => {
            set((state) => ({
                toasts: state.toasts.filter((item) => item.id !== id),
            }));
        }, 3200);
    },
    dismissToast: (id) =>
        set((state) => ({
            toasts: state.toasts.filter((toast) => toast.id !== id),
        })),
}));

export function useToast() {
    const pushToast = useToastStore((state) => state.pushToast);

    return {
        toast: pushToast,
        success: (title: string, description?: string) =>
            pushToast({ title, description, variant: "success" }),
        error: (title: string, description?: string) =>
            pushToast({ title, description, variant: "error" }),
        info: (title: string, description?: string) =>
            pushToast({ title, description, variant: "default" }),
    };
}
