export type ChatKernelState =
  | "IDLE"
  | "BOOTING"
  | "SESSION_REGISTERING"
  | "SOCKET_CONNECTING"
  | "SYNCING_CONVERSATIONS"
  | "HYDRATING_PENDING_INTENTS"
  | "READY"
  | "RECONNECTING"
  | "RECONCILING"
  | "FAILED";

type BootContract = Readonly<{
  registerSession: () => Promise<string | null>;
  connectSocket: () => Promise<void>;
  loadConversations: () => Promise<void>;
  hydrateIntents: () => Promise<void>;
}>;

export class ChatBootKernel {
  private static instance: ChatBootKernel;

  static getInstance() {
    if (!this.instance) {
      this.instance = new ChatBootKernel();
    }
    return this.instance;
  }

  private state: ChatKernelState = "IDLE";
  private bootToken = 0;
  private activeUserId: string | null = null;

  async boot(userId: string, deps: BootContract) {
    this.bootToken++;
    const token = this.bootToken;
    this.activeUserId = userId;

    // Snapshot the contract so we don't accidentally execute stale React closures
    // if the identity drifts during the async pipeline.
    const contract = Object.freeze({ ...deps });

    const assert = () => {
      if (token !== this.bootToken) {
        throw new Error("STALE_BOOT_ABORT");
      }
    };

    try {
      this.state = "BOOTING";

      this.state = "SESSION_REGISTERING";
      await contract.registerSession();
      assert();

      this.state = "SOCKET_CONNECTING";
      await contract.connectSocket();
      assert();

      this.state = "SYNCING_CONVERSATIONS";
      await contract.loadConversations();
      assert();

      this.state = "HYDRATING_PENDING_INTENTS";
      await contract.hydrateIntents();
      assert();

      this.state = "READY";
      console.log("[ChatBootKernel] Boot pipeline finished successfully. State: READY");
    } catch (e) {
      if ((e as Error).message === "STALE_BOOT_ABORT") {
        console.log(`[ChatBootKernel] Stale boot aborted (token: ${token})`);
        return;
      }

      this.state = "FAILED";
      console.error("[ChatBootKernel] Boot failed:", e);
    }
  }

  getState() {
    return {
      state: this.state,
      userId: this.activeUserId,
      bootToken: this.bootToken
    };
  }

  reset() {
      this.state = "IDLE";
      this.activeUserId = null;
      this.bootToken++;
  }
}
