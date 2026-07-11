import "./ui/styles.css";
import { KotodamaApp } from "./ui/app";

const host = document.querySelector<HTMLElement>("#app");

if (!host) throw new Error("KOTODAMA could not find #app");

new KotodamaApp(host);
