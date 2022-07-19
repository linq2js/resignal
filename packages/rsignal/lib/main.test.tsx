import { act, renderHook } from "@testing-library/react-hooks";
import { spawn, signal, delay, useSignal, EffectContext } from "./main";

test("counter using local var", () => {
  let count = 0;
  const increment = signal();
  const { result } = renderHook(() => {
    useSignal(increment);
    return count;
  });
  expect(result.current).toBe(0);
  act(() => {
    increment(() => {
      count++;
    });
  });
  expect(result.current).toBe(1);
});

test("counter using payload", () => {
  const count = signal({ payload: 0 });
  const { result } = renderHook(() => {
    useSignal(count);
    return count.payload();
  });
  expect(result.current).toBe(0);
  act(() => {
    count(count.payload() + 1);
  });
  expect(result.current).toBe(1);
});

test("race", async () => {
  const pressed = signal({ payload: false });
  spawn(async ({ race }) => {
    const result = await race({
      one: delay(10, 1),
      two: delay(5, 2),
    });
    expect(result.one).toBeUndefined();
    expect(result.two).not.toBeUndefined();
    expect(result.two?.payload()).toBe(2);
    pressed(true);
  });
  await delay(20);
  expect(pressed.payload()).toBeTruthy();
});

test("user auth", async () => {
  const tokenSignal = signal<string>();
  const profileSignal = signal<{ username: string }>();
  const login = signal<{ username: string; password: string }>();
  const logout = signal();

  const loadUserProfileApi = (token: string) => ({
    username: token.split("|")[0],
  });
  const loginApi = async (username: string, password: string) =>
    `${username}|${password}`;

  const loadProfileFlow = async (context: EffectContext) => {
    const token = tokenSignal.payload();
    if (!token) {
      profileSignal({ username: "anonymous" });
    } else {
      const result = await context.call(() => loadUserProfileApi(token));
      profileSignal(result);
    }
  };

  const handleUserLoginFlow = async (context: EffectContext) => {
    await context.all({ login });
    const { username, password } = login.payload()!;
    // call server login api
    const result = await context.call(() => loginApi(username, password));
    // update token
    tokenSignal(result);
    await context.call(loadProfileFlow);
  };

  const handleUserLogoutFlow = async (context: EffectContext) => {
    await context.all({ logout });
    // clear token
    tokenSignal("");
    await context.call(loadProfileFlow);
  };

  // main flow
  spawn(async (context) => {
    try {
      await context.call(loadProfileFlow);

      while (true) {
        const isAnonymousUser =
          profileSignal.payload()?.username === "anonymous";

        if (isAnonymousUser) {
          await context.call(handleUserLoginFlow);
        }

        await context.call(handleUserLogoutFlow);
      }
    } catch (ex: any) {
      alert(`Something went wrong: ${ex.message}`);
    }
  });

  await delay();

  expect(profileSignal.payload()?.username).toBe("anonymous");

  login({ username: "test", password: "test" });

  await delay();

  expect(profileSignal.payload()?.username).toBe("test");

  logout();

  await delay();

  expect(profileSignal.payload()?.username).toBe("anonymous");

  login({ username: "admin", password: "test" });

  await delay();

  expect(profileSignal.payload()?.username).toBe("admin");

  logout();

  await delay();

  expect(profileSignal.payload()?.username).toBe("anonymous");
});

test("when", async () => {
  let count = 0;
  const clicked = signal<number>();

  spawn(async ({ when }) => {
    await when(delay());
    count++;
    const value = await when(clicked);
    count += value;
  });

  expect(count).toBe(0);
  await delay();
  expect(count).toBe(1);
  clicked(2);
  await delay();
  expect(count).toBe(3);
});
