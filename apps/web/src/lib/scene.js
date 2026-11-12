/* The 3D floor, loaded on demand (audit T3). three.js and the scene are a separate chunk that is fetched the first
   time the Floor opens, so sign-in, the dashboard, reports and the line-display TVs never download it or create a
   WebGL context. Until it has loaded, calls are safe no-ops; the last camera request is replayed once it is ready. */
let impl = null, loading = null, pending = null;

export const Scene3D = {
  get ok() { return !!(impl && impl.ok); },
  get loaded() { return !!impl; },
  /** Load and start the scene in el. Resolves to false when WebGL is not available. */
  load(el, opts) {
    if (!loading) {
      loading = import('@mg/scene').then(({ Scene3D: S }) => {
        const ok = S.init(el, opts);
        impl = S;
        if (ok && pending) { const [fn, arg] = pending; S[fn](arg); }
        pending = null;
        return ok;
      }, () => false);
    }
    return loading;
  },
  render(t, now) { if (impl && impl.ok) impl.render(t, now); },
  setTheme(t) { if (impl && impl.ok) impl.setTheme(t); },
  setSafeArea(a) { if (impl && impl.ok) impl.setSafeArea(a); },
  focusView(v) { if (impl && impl.ok) impl.focusView(v); else pending = ['focusView', v]; },
  focusAny(s) { if (impl && impl.ok) impl.focusAny(s); else pending = ['focusAny', s]; },
  focusPos(p) { if (impl && impl.ok) impl.focusPos(p); else pending = ['focusPos', p]; },
  focusVehicle(v) { if (impl && impl.ok) impl.focusVehicle(v); else pending = ['focusVehicle', v]; },
};
