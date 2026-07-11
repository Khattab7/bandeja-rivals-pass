const G = { fontFamily: 'Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif' };

export default function PlayLoading() {
  return (
    <div className="min-h-screen bg-brand-dark flex flex-col items-center justify-center gap-4">
      <div className="w-10 h-10 border-2 border-brand-green/20 border-t-brand-green rounded-full animate-spin" />
      <p className="text-white/30 text-xs tracking-widest uppercase" style={G}>Loading matches…</p>
    </div>
  );
}
