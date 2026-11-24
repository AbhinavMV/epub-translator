import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Route tests render the whole app; on two-core CI runners that can outlast the 1 s default.
configure({ asyncUtilTimeout: 5000 });

afterEach(cleanup);
