import type { AppServices } from "@/app-services";
import { createHttpAdminApi } from "@/auth/admin-api";
import { MemoryEnvelopeStore } from "@/keys/memory-store";
import { UnlockBus } from "@/keys/unlock-bus";
import { Vault } from "@/keys/vault";
import { browserSleep } from "@/translate/compose-hosted";
import { hostedProviders } from "@/translate/hosted-api";
import { ClientRuntime } from "@/translate/runtime";
import type { WorkApi } from "@/translate/work-api";
import { type Api, ApiRequestError } from "./client";
import { createMockApi } from "./mock";
import {
  createMockAdminApi,
  MockAuthClient,
  type MockStorage,
  mockAuthFetch,
  mockHostedState,
} from "./mock-hosted";

const noWorkApi = new Proxy({} as WorkApi, {
  get: () => () =>
    Promise.reject(new ApiRequestError("In-browser translation is not part of the mock", 501)),
});

export async function createMockApp(search: string, storage: MockStorage): Promise<AppServices> {
  const mock = createMockApi();
  const state = mockHostedState(search, storage);
  if (!state) return { api: mock, client: null, adminApi: createHttpAdminApi(), hosted: null };

  const vault = new Vault({ store: new MemoryEnvelopeStore(), scope: "mock" });
  await vault.load();
  const unlock = new UnlockBus();
  const runtime = new ClientRuntime({
    api: noWorkApi,
    base: mock,
    vault,
    sleep: browserSleep,
    requestUnlock: () => unlock.request(),
  });
  const api: Api = {
    ...mock,
    upload: { mode: "signed", maxBytes: mock.upload.maxBytes },
    listProviders: async () => hostedProviders(await mock.listProviders(), vault, () => undefined),
  };
  return {
    api,
    client: new MockAuthClient(storage),
    authFetch: mockAuthFetch,
    adminApi: createMockAdminApi(),
    hosted: { vault, runtime, unlock },
  };
}
