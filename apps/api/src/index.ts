import { createApp } from "./app.ts";
import { composeHostedServices } from "./compose-hosted.ts";

export default createApp(composeHostedServices(process.env));
