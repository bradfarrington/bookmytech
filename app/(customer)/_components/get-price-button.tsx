"use client";

import { Button, type ButtonProps } from "@/components/ui/button";
import { GET_PRICE_INPUT_ID } from "./get-price";

/** Scrolls to the hero's reg input and focuses it; off the homepage, goes to /book. */
export function focusGetPrice() {
  const input = document.getElementById(GET_PRICE_INPUT_ID);
  if (!input) {
    window.location.assign("/book");
    return;
  }
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  input.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  input.focus({ preventScroll: true });
}

// Only serialisable props: server components render this, so no icon components.
export function GetPriceButton(props: Pick<ButtonProps, "variant" | "size" | "className" | "children">) {
  return <Button {...props} onClick={focusGetPrice} />;
}
