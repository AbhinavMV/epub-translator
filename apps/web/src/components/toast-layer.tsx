import {
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useState,
} from "react";
import { Toaster } from "@/components/ui/sonner";

const GAP = 8;

const ClearanceContext = createContext<(px: number) => void>(() => {});

export function ToastLayer({ theme, children }: { theme: "light" | "dark"; children: ReactNode }) {
  const [clearance, setClearance] = useState(0);
  return (
    <ClearanceContext.Provider value={setClearance}>
      {children}
      <Toaster
        theme={theme}
        position="bottom-right"
        offset={{ bottom: 24 + clearance }}
        mobileOffset={{ bottom: 16 + clearance }}
      />
    </ClearanceContext.Provider>
  );
}

export function useToastClearance(ref: RefObject<HTMLElement | null>, active: boolean) {
  const setClearance = useContext(ClearanceContext);
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const measure = () =>
      setClearance(Math.max(0, window.innerHeight - el.getBoundingClientRect().top + GAP));
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(el);
    if (el.parentElement) observer?.observe(el.parentElement);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { capture: true, passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, { capture: true });
      setClearance(0);
    };
  }, [ref, active, setClearance]);
}
