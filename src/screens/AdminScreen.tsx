/**
 * 管理画面（SPEC §7）。中身はフェーズ5で作る。
 * このタブは、管理者だけが読める admin/ping を読めた人にだけ表示している（SPEC §6.5）。
 */
export function AdminScreen() {
  return (
    <div className="screen">
      <h1 className="screen-title">管理</h1>
      <section className="card">
        <h2 className="card-title">準備中</h2>
        <p className="muted">利用者の一覧・苦手分野の確認などは、今後ここに追加します。</p>
      </section>
    </div>
  );
}
