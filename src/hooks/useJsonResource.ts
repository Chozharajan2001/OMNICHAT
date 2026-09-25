"use client";

import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";

async function readJson<T>(url: string, signal: AbortSignal, errorMessage: string): Promise<T> {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(errorMessage);
    return response.json();
}

// A single request owner prevents stale responses after refresh, navigation, or unmount.
export function useJsonResource<T>(url: string, errorMessage: string, refreshKey = url) {
    const [data, updateData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const activeRequest = useRef<AbortController | null>(null);
    const mounted = useRef(false);

    const load = useCallback(() => {
        activeRequest.current?.abort();
        const controller = new AbortController();
        activeRequest.current = controller;
        return readJson<T>(url, controller.signal, errorMessage).then(
            (result) => {
                if (controller.signal.aborted) return;
                updateData(result);
                setError(null);
                setLoading(false);
            },
            (cause: unknown) => {
                if (controller.signal.aborted) return;
                setError(cause instanceof Error ? cause.message : errorMessage);
                setLoading(false);
            }
        );
    }, [url, errorMessage]);

    useEffect(() => {
        mounted.current = true;
        void load();
        return () => {
            mounted.current = false;
            activeRequest.current?.abort();
        };
    }, [load, refreshKey]);

    const refresh = useCallback(() => {
        if (!mounted.current) return Promise.resolve();
        setLoading(true);
        return load();
    }, [load]);

    const setData = useCallback((value: SetStateAction<T | null>) => {
        if (!mounted.current) return;
        // A completed mutation must not be overwritten by an earlier GET.
        activeRequest.current?.abort();
        updateData(value);
        setError(null);
        setLoading(false);
    }, []);

    return { data, loading, error, refresh, setData };
}
