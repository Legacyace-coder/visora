interface Window {
  homeLanguageMessage?: (key: string) => string;
  siteMenuLabel?: (open: boolean) => string;
}

(() => {
  const picker = document.querySelector<HTMLSelectElement>("#home-language");
  if (!picker) return;
  const languages = ["ja", "ko", "zh", "vi", "de", "es"] as const;
  type Language = typeof languages[number];
  const entries: [string, string[]][] = [
    [".site-header nav a:nth-child(1)", ["ホーム","홈","首页","Trang chủ","Startseite","Inicio"]],
    [".site-header nav a:nth-child(2)", ["コレクション","컬렉션","作品集","Bộ sưu tập","Kollektion","Colección"]],
    [".site-header nav a:nth-child(3)", ["ギャラリー","갤러리","画廊","Thư viện","Galerie","Galería"]],
    [".site-header nav a:nth-child(4)", ["写真家","사진가","摄影师","Nhiếp ảnh gia","Fotografen","Fotógrafos"]],
    [".site-header nav a:nth-child(5)", ["私たちについて","소개","关于我们","Giới thiệu","Über uns","Nosotros"]],
    [".header-actions > a:first-of-type", ["ログイン","로그인","登录","Đăng nhập","Anmelden","Iniciar sesión"]],
    [".header-actions > a.button", ["Visoraに参加","Visora 가입","加入 Visora","Tham gia Visora","Visora beitreten","Únete a Visora"]],
    [".home-hero .eyebrow", ["独立系写真出版","독립 사진 출판","独立摄影出版","XUẤT BẢN NHIẾP ẢNH ĐỘC LẬP","UNABHÄNGIGES FOTOGRAFIE-PUBLISHING","PUBLICACIÓN FOTOGRÁFICA INDEPENDIENTE"]],
    [".home-hero h1", ["すべての写真に、物語がある。","모든 사진에는 이야기가 있습니다.","每张照片都有一个故事。","Mỗi bức ảnh đều có một câu chuyện.","Jedes Bild erzählt eine Geschichte.","Cada imagen tiene una historia."]],
    [".home-hero .lead", ["写真家が作品を紹介、応募、出版する機会につながるプラットフォーム。","사진가가 작품을 소개하고 제출하며 출판할 기회를 연결하는 플랫폼입니다.","连接摄影师与展示、投稿及出版机会的平台。","Nền tảng kết nối nhiếp ảnh gia với cơ hội giới thiệu, gửi và xuất bản tác phẩm.","Eine Plattform, die Fotografen mit Möglichkeiten verbindet, ihre Arbeit zu zeigen, einzureichen und zu veröffentlichen.","Una plataforma que conecta a fotógrafos con oportunidades para presentar, enviar y publicar su trabajo."]],
    [".hero-actions a:first-child", ["写真家の方へ","사진가를 위한 공간","摄影师专区","Dành cho nhiếp ảnh gia","Für Fotografen","Para fotógrafos"]],
    [".hero-actions a:last-child", ["ギャラリーを見る","갤러리 둘러보기","探索画廊","Khám phá thư viện","Galerie entdecken","Explorar la galería"]],
    [".photo-slide:nth-child(1) figcaption", ["01 / 写真を生み出す人々","01 / 사진 뒤의 사람들","01 / 镜头背后的人","01 / NGƯỜI ĐỨNG SAU BỨC ẢNH","01 / DIE MENSCHEN HINTER DEM BILD","01 / LAS PERSONAS DETRÁS DE LA IMAGEN"]],
    [".photo-slide:nth-child(2) figcaption", ["02 / 私たちの写真","02 / 우리가 만드는 사진","02 / 我们创作的影像","02 / NHỮNG BỨC ẢNH TA TẠO RA","02 / DIE BILDER, DIE WIR SCHAFFEN","02 / LAS IMÁGENES QUE CREAMOS"]],
    [".photo-slide:nth-child(3) figcaption", ["03 / 大切にする物語","03 / 우리가 간직하는 이야기","03 / 我们珍藏的故事","03 / NHỮNG CÂU CHUYỆN TA LƯU GIỮ","03 / DIE GESCHICHTEN, DIE BLEIBEN","03 / LAS HISTORIAS QUE GUARDAMOS"]],
    [".photo-stories-heading .eyebrow", ["レンズを通して","렌즈를 통해","透过镜头","QUA ỐNG KÍNH","DURCH DAS OBJEKTIV","A TRAVÉS DEL OBJETIVO"]],
    ["#photo-stories-heading", ["見てもらうために。","보여지기 위해.","让作品被看见。","Để được nhìn thấy.","Geschaffen, um gesehen zu werden.","Hechas para ser vistas."]],
    [".photo-stories-heading > p", ["すべての視点は、少し深く見つめることから始まります。","모든 시선은 조금 더 자세히 바라보는 데서 시작됩니다.","每一种视角都始于更仔细的观察。","Mỗi góc nhìn bắt đầu từ một người nhìn kỹ hơn.","Jede Perspektive beginnt damit, genauer hinzusehen.","Cada perspectiva comienza al mirar un poco más de cerca."]],
    [".photo-stories-grid figure:nth-child(1) figcaption", ["写真家 / 視点","사진가 / 시선","摄影师 / 视角","NHIẾP ẢNH GIA / GÓC NHÌN","DER FOTOGRAF / DIE PERSPEKTIVE","EL FOTÓGRAFO / LA PERSPECTIVA"]],
    [".photo-stories-grid figure:nth-child(2) figcaption", ["制作 / 細部","과정 / 디테일","过程 / 细节","QUÁ TRÌNH / CHI TIẾT","DER PROZESS / DIE DETAILS","EL PROCESO / LOS DETALLES"]],
    [".photo-stories-grid figure:nth-child(3) figcaption", ["作品 / 物語","작품 / 이야기","作品 / 故事","TÁC PHẨM / CÂU CHUYỆN","DAS WERK / DIE GESCHICHTE","LA OBRA / LA HISTORIA"]],
    [".how-it-works .eyebrow", ["VISORAでの旅","VISORA와 함께하는 여정","您的 VISORA 之旅","HÀNH TRÌNH CÙNG VISORA","IHRE REISE MIT VISORA","TU CAMINO CON VISORA"]],
    ["#how-it-works-heading", ["ご利用の流れ。","이용 방법.","如何运作。","Cách hoạt động.","So funktioniert es.","Cómo funciona."]],
    [".how-it-works-heading > p", ["最初のアップロードから収益を得る機会までの流れをご紹介します。","첫 업로드부터 수익을 얻을 기회까지의 과정입니다.","从首次上传到获得收入机会，了解整个流程。","Từ lần tải đầu tiên đến cơ hội kiếm thu nhập, đây là quy trình.","Vom ersten Upload bis zur Verdienstmöglichkeit: So läuft es ab.","Desde tu primera carga hasta la oportunidad de ganar, así funciona."]],
    [".how-it-works-steps li:nth-child(1) h3", ["登録","가입","注册","Đăng ký","Registrieren","Regístrate"]],
    [".how-it-works-steps li:nth-child(1) p", ["写真家アカウントを作成し、ワークスペースをご確認ください。","사진가 계정을 만들고 작업 공간을 살펴보세요.","创建摄影师账户，了解您的工作空间。","Tạo tài khoản nhiếp ảnh gia và làm quen với không gian làm việc.","Erstellen Sie ein Fotografenkonto und lernen Sie Ihren Arbeitsbereich kennen.","Crea una cuenta de fotógrafo y conoce tu espacio de trabajo."]],
    [".how-it-works-steps li:nth-child(2) h3", ["パートナー申請","파트너십 신청","申请合作伙伴","Đăng ký đối tác","Partnerschaft beantragen","Solicita la colaboración"]],
    [".how-it-works-steps li:nth-child(2) p", ["パートナーシップは任意です。ワークスペースから申請し、審査状況を確認できます。","파트너십은 선택 사항입니다. 작업 공간에서 신청하고 심사 상태를 확인하세요.","合作伙伴关系为自愿选择。可在工作空间申请并跟踪审核。","Quan hệ đối tác là tùy chọn. Đăng ký và theo dõi xét duyệt trong không gian làm việc.","Die Partnerschaft ist freiwillig. Beantragen und verfolgen Sie sie im Arbeitsbereich.","La colaboración es opcional. Solicítala y sigue su revisión desde tu espacio."]],
    [".how-it-works-steps li:nth-child(3) h3", ["写真をアップロード","사진 업로드","上传照片","Tải ảnh lên","Bilder hochladen","Sube imágenes"]],
    [".how-it-works-steps li:nth-child(3) p", ["ポートフォリオを作成し、写真やコレクションを審査に提出します。","포트폴리오를 만들고 사진이나 컬렉션을 심사에 제출하세요.","建立作品集，然后提交照片或合集供审核。","Xây dựng danh mục, sau đó gửi ảnh hoặc bộ sưu tập để xét duyệt.","Erstellen Sie Ihr Portfolio und reichen Sie Fotos oder Kollektionen zur Prüfung ein.","Crea tu portafolio y envía fotografías o colecciones para su revisión."]],
    [".how-it-works-steps li:nth-child(4) h3", ["写真の審査","사진 심사","照片审核","Ảnh được xét duyệt","Bilder werden geprüft","Revisión de imágenes"]],
    [".how-it-works-steps li:nth-child(4) p", ["提出状況を追跡し、承認された写真を確認できます。","제출 현황과 승인된 사진을 확인하세요.","跟踪投稿，查看哪些照片获得批准。","Theo dõi bài gửi và xem ảnh nào được phê duyệt.","Verfolgen Sie Ihre Einreichungen und sehen Sie, welche Fotos genehmigt wurden.","Sigue tus envíos y comprueba qué fotografías se aprueban."]],
    [".how-it-works-steps li:nth-child(5) h3", ["支払いを受け取る","지급 받기","获得付款","Nhận thanh toán","Auszahlung erhalten","Recibe el pago"]],
    [".how-it-works-steps li:nth-child(5) p", ["購入オファーを承諾するとウォレットに入金され、出金条件に従って支払いを申請できます。","인수 제안을 수락하면 지갑에 적립되며 출금 조건에 따라 지급을 요청할 수 있습니다.","接受收购报价后，款项记入钱包；可按提现要求申请付款。","Chấp nhận đề nghị mua để nhận tiền vào ví, sau đó yêu cầu thanh toán theo điều kiện rút tiền.","Nach Annahme eines Ankaufsangebots wird Ihr Guthaben gutgeschrieben; eine Auszahlung unterliegt den Auszahlungsbedingungen.","Acepta una oferta de adquisición para recibir crédito en tu monedero y solicita un pago sujeto a los requisitos de retiro."]],
    [".how-it-works-rates p:nth-child(1)", ["パートナーは写真1枚につき120米ドル","파트너 사진당 미화 120달러","合作伙伴每张照片 120 美元","Đối tác: 120 USD mỗi ảnh","120 USD pro Foto für Partner","120 USD por foto para colaboradores"]],
    [".how-it-works-rates p:nth-child(2)", ["非パートナーは写真1枚につき100米ドル","비파트너 사진당 미화 100달러","非合作伙伴每张照片 100 美元","Không phải đối tác: 100 USD mỗi ảnh","100 USD pro Foto für Nichtpartner","100 USD por foto para quienes no son colaboradores"]],
    [".how-it-works-rates p:nth-child(3)", ["新しい購入オファーの金額は、写真の初回承認時のパートナー状況に基づきます。承認だけではオファーや支払いは保証されません。","새 인수 제안의 금액은 사진 최초 승인 시의 파트너 상태를 기준으로 합니다. 승인만으로 제안이나 지급이 보장되지는 않습니다.","新收购报价的费率取决于照片首次获批时的合作伙伴状态。获批本身不保证获得报价或付款。","Mức giá áp dụng cho đề nghị mua mới dựa trên trạng thái đối tác khi ảnh được duyệt lần đầu. Phê duyệt không đảm bảo có đề nghị hoặc thanh toán.","Die Sätze für neue Ankaufsangebote richten sich nach dem Partnerstatus bei der ersten Genehmigung. Eine Genehmigung allein garantiert weder Angebot noch Auszahlung.","Las tarifas de nuevas ofertas se basan en el estado de colaboración al aprobarse la foto por primera vez. La aprobación no garantiza una oferta ni un pago."]],
    [".how-it-works > a", ["始める","시작하기","开始您的旅程","Bắt đầu hành trình","Jetzt starten","Comienza tu camino"]],
    [".agent-notice .eyebrow", ["安全のために","안전을 위한 안내","安全提示","LƯU Ý AN TOÀN","HINWEIS ZU IHRER SICHERHEIT","UNA NOTA SOBRE TU SEGURIDAD"]],
    ["#agent-notice-heading", ["連絡相手を確認しましょう。","연락 상대를 확인하세요.","确认联系人的身份。","Hãy biết bạn đang nói chuyện với ai.","Wissen Sie, mit wem Sie sprechen.","Conoce a la persona con la que hablas."]],
    [".agent-notice > div:last-child > p:nth-of-type(2)", ["Visoraの代理人を名乗る人から連絡があった場合、代理人番号（代理人コード）を尋ね、公式のVisora窓口で本人確認をしてください。番号だけでは本人とは証明できません。","Visora 에이전트라고 주장하는 사람이 연락하면 에이전트 번호(코드)를 요청하고 공식 Visora 채널에서 신원을 확인하세요. 번호만으로 신원이 증명되지는 않습니다.","如果有人声称是 Visora 代理，请索要代理编号（代理代码），并通过 Visora 官方渠道核实身份。仅凭编号不能证明其身份。","Nếu ai đó tự nhận là đại diện Visora, hãy yêu cầu số hoặc mã đại diện và xác minh danh tính qua kênh Visora chính thức. Chỉ có mã không chứng minh được danh tính.","Fragen Sie Personen, die sich als Visora-Agenten ausgeben, nach ihrer Agentennummer und prüfen Sie ihre Identität über einen offiziellen Visora-Kanal. Eine Nummer allein beweist keine Identität.","Si alguien dice ser agente de Visora, pide su número o código y verifica su identidad por un canal oficial de Visora. Un número por sí solo no prueba su identidad."]],
    [".agent-notice > div:last-child > p:nth-of-type(3)", ["パスワードや認証コードを代理人に決して共有しないでください。","비밀번호나 인증 코드를 에이전트에게 절대 알려주지 마세요.","切勿向代理人分享密码或验证码。","Không bao giờ chia sẻ mật khẩu hoặc mã xác minh với đại diện.","Teilen Sie niemals Ihr Passwort oder Ihre Bestätigungscodes mit einem Agenten.","Nunca compartas tu contraseña ni tus códigos de verificación con un agente."]],
    [".agent-search label", ["代理人を確認","에이전트 확인","验证代理人","Xác minh đại diện","Agent prüfen","Verificar agente"]],
    [".agent-search button", ["検索 ↗","검색 ↗","搜索 ↗","Tìm kiếm ↗","Suchen ↗","Buscar ↗"]],
    [".about-story .eyebrow", ["VISORAの理念","VISORA의 생각","VISORA 理念","Ý TƯỞNG VISORA","DIE VISORA-IDEE","LA IDEA DE VISORA"]],
    [".about-story h2", ["写真には、アップロードするだけではない場所が必要です。","사진에는 단순히 업로드하는 공간 이상의 것이 필요합니다.","摄影值得拥有一个不止于上传的空间。","Nhiếp ảnh xứng đáng có một nơi không chỉ để tải lên.","Fotografie verdient mehr als einen Ort zum Hochladen.","La fotografía merece más que un lugar donde subirla."]],
    [".about-story > div > p:nth-of-type(1)", ["Visoraは、写真を生み出す人々のために開発されています。写真家が作品を整理し、写真やコレクションを提出して審査状況を追跡できる場を目指しています。","Visora는 사진을 만드는 사람들을 중심으로 개발되고 있습니다. 사진가가 작품을 정리하고 사진이나 컬렉션을 제출하며 심사 과정을 확인할 공간을 만들고자 합니다.","Visora 围绕摄影背后的创作者而发展。我们致力于建立一个空间，让摄影师整理作品、提交照片或合集并跟踪审核进度。","Visora được phát triển xoay quanh những người tạo ra bức ảnh. Chúng tôi muốn tạo không gian để nhiếp ảnh gia quản lý tác phẩm, gửi ảnh hoặc bộ sưu tập và theo dõi quá trình xét duyệt.","Visora entsteht für die Menschen hinter den Fotografien. Wir schaffen einen Raum, in dem Fotografen ihre Arbeit ordnen, Bilder oder Kollektionen einreichen und die Prüfung verfolgen können.","Visora se desarrolla en torno a las personas detrás de las fotografías. Queremos crear un espacio para organizar obras, enviar imágenes o colecciones y seguir su revisión."]],
    [".about-story > div > p:nth-of-type(2)", ["選ばれた作品は購入や出版の対象となる場合があり、許可と写真家のクレジットを重視します。","선택된 작품은 인수 및 출판 대상으로 고려될 수 있으며 허가와 사진가 표기를 중요하게 다룹니다.","入选作品可能被考虑用于收购和出版，授权与摄影师署名是重要环节。","Tác phẩm được chọn có thể được cân nhắc mua và xuất bản, với quyền sử dụng và ghi công nhiếp ảnh gia là yếu tố thiết yếu.","Ausgewählte Arbeiten können für Ankauf und Veröffentlichung berücksichtigt werden; Rechte und Urheberangaben sind dabei wesentlich.","Las obras seleccionadas pueden considerarse para adquisición y publicación, con los permisos y la atribución como elementos esenciales."]],
    [".feature-list article:nth-child(1) > span", ["01 / ポートフォリオ","01 / 포트폴리오","01 / 作品集","01 / DANH MỤC","01 / PORTFOLIO","01 / PORTAFOLIO"]],
    [".feature-list article:nth-child(1) h2", ["あなたの作品のための場所。","작품을 위한 공간.","属于您作品的空间。","Không gian cho tác phẩm của bạn.","Ein Raum für Ihre Arbeit.","Un espacio para tu trabajo."]],
    [".feature-list article:nth-child(1) p", ["写真家は写真を管理し、コレクションに整理できます。","사진가는 사진 포트폴리오를 만들고 관리하며 컬렉션으로 정리할 수 있습니다.","摄影师可以创建和管理摄影作品集，并将作品整理成合集。","Nhiếp ảnh gia có thể tạo, quản lý danh mục ảnh và sắp xếp thành bộ sưu tập.","Fotografen können ein Portfolio erstellen, verwalten und ihre Fotos in Kollektionen organisieren.","Los fotógrafos pueden crear y gestionar un portafolio y organizar sus imágenes en colecciones."]],
    [".feature-list article:nth-child(2) > span", ["02 / 提出","02 / 제출","02 / 投稿","02 / BÀI GỬI","02 / EINREICHUNGEN","02 / ENVÍOS"]],
    [".feature-list article:nth-child(2) h2", ["丁寧な審査プロセス。","신중한 심사 과정.","严谨的审核流程。","Quy trình xét duyệt chu đáo.","Ein sorgfältiger Prüfprozess.","Un proceso de revisión cuidadoso."]],
    [".feature-list article:nth-child(2) p", ["写真やコレクションを提出し、進行状況を確認できます。","개별 사진이나 컬렉션을 제출하고 진행 상황을 확인하세요.","提交单张照片或合集，跟踪审核进度。","Gửi ảnh riêng lẻ hoặc bộ sưu tập và theo dõi tiến trình.","Reichen Sie einzelne Fotos oder Kollektionen ein und verfolgen Sie den Fortschritt.","Envía fotografías individuales o colecciones y sigue su progreso."]],
    [".feature-list article:nth-child(3) > span", ["03 / 出版","03 / 출판","03 / 出版","03 / XUẤT BẢN","03 / VERÖFFENTLICHUNG","03 / PUBLICACIÓN"]],
    [".feature-list article:nth-child(3) h2", ["作品を大切に紹介します。","작품을 세심하게 소개합니다.","用心呈现作品。","Tác phẩm được giới thiệu cẩn trọng.","Arbeiten sorgfältig präsentiert.","Obras presentadas con cuidado."]],
    [".feature-list article:nth-child(3) p", ["明確な許可、適切な購入契約、正確な写真家のクレジットを大切にしています。","명확한 허가, 적절한 인수 계약과 정확한 사진가 표기를 중요하게 생각합니다.","我们的出版方式重视明确授权、适当的收购安排和准确的摄影师署名。","Chúng tôi chú trọng quyền sử dụng rõ ràng, thỏa thuận mua phù hợp và ghi công chính xác.","Unser Ansatz setzt auf klare Rechte, angemessene Ankaufsvereinbarungen und korrekte Urheberangaben.","Nuestro enfoque se centra en permisos claros, acuerdos de adquisición adecuados y créditos precisos."]],
    [".simple-callout .eyebrow", ["写真家の方へ","사진가를 위해","摄影师专区","DÀNH CHO NHIẾP ẢNH GIA","FÜR FOTOGRAFEN","PARA FOTÓGRAFOS"]],
    [".simple-callout h2", ["あなたの視点が輝く場所。","당신의 시선이 머물 곳.","让您的视角找到归属。","Góc nhìn của bạn xứng đáng có một nơi.","Ihre Perspektive gehört hierher.","Tu perspectiva tiene un lugar."]],
    [".simple-callout > p:not(.eyebrow)", ["ポートフォリオを作り、Visoraでの提出方法をご覧ください。","포트폴리오를 만들고 Visora 제출 방법을 알아보세요.","开始建立作品集，了解如何在 Visora 投稿。","Bắt đầu xây dựng danh mục và tìm hiểu cách gửi tác phẩm trên Visora.","Erstellen Sie Ihr Portfolio und erfahren Sie, wie Einreichungen auf Visora funktionieren.","Comienza tu portafolio y descubre cómo funcionan los envíos en Visora."]],
    [".simple-callout a", ["アカウントを作成","계정 만들기","创建账户","Tạo tài khoản","Konto erstellen","Crea tu cuenta"]],
    [".site-footer > p", ["写真を、丁寧に。","사진을 소중하게.","用心对待摄影。","Nhiếp ảnh, được trân trọng.","Fotografie mit Bedacht.","Fotografía, con cuidado."]],
  ];
  // Header and footer entries apply to every public page; the rest only exist on the home page.
  const isHome = !!document.querySelector(".home-hero");
  const isShared = (selector: string): boolean => /^(\.site-header|\.header-actions|\.site-footer)/.test(selector);
  const nodes = entries
    .filter(([selector]) => isHome || isShared(selector))
    .flatMap(([selector, translations]) => {
      const node = document.querySelector<HTMLElement>(selector);
      if (!node) return [];
      if (translations.length !== languages.length) throw new Error(`Invalid translation: ${selector}`);
      return [{ node, original: node.innerHTML, translations }];
    });
  const handled = new Set<Element>(nodes.map(({ node }) => node));
  const placeholders = ["代理人番号 / 代理人コードを検索", "에이전트 번호 / 코드 검색", "搜索代理编号 / 代理代码", "Tìm số / mã đại diện", "Agentennummer / Agentencode suchen", "Buscar número / código de agente"];
  const messages: Record<string, string[]> = {
    invalid: ["Enter a valid agent code, for example A-ABC-12345.", "有効な代理人コード（例：A-ABC-12345）を入力してください。", "올바른 에이전트 코드(예: A-ABC-12345)를 입력하세요.", "请输入有效的代理代码，例如 A-ABC-12345。", "Nhập mã đại diện hợp lệ, ví dụ A-ABC-12345.", "Geben Sie einen gültigen Agentencode ein, z. B. A-ABC-12345.", "Introduce un código válido, por ejemplo A-ABC-12345."],
    searching: ["Searching...", "検索中…", "검색 중…", "正在搜索…", "Đang tìm kiếm…", "Suche läuft…", "Buscando…"],
    missing: ["No agent was found for this code.", "このコードの代理人は見つかりませんでした。", "이 코드에 해당하는 에이전트를 찾을 수 없습니다.", "未找到此代码对应的代理人。", "Không tìm thấy đại diện với mã này.", "Für diesen Code wurde kein Agent gefunden.", "No se encontró ningún agente con este código."],
    active: ["Active agent", "有効な代理人", "활동 중인 에이전트", "在职代理人", "Đại diện đang hoạt động", "Aktiver Agent", "Agente activo"],
    inactive: ["Inactive agent", "無効な代理人", "활동 중이 아닌 에이전트", "非在职代理人", "Đại diện không hoạt động", "Inaktiver Agent", "Agente inactivo"],
    caution: ["A code alone does not prove who is contacting you. Verify their identity through an official Visora channel.", "コードだけでは連絡相手の本人確認にはなりません。公式Visora窓口で確認してください。", "코드만으로 연락한 사람의 신원을 증명할 수 없습니다. 공식 Visora 채널에서 확인하세요.", "仅凭代码不能证明联系人的身份。请通过 Visora 官方渠道核实。", "Chỉ mã không chứng minh danh tính người liên hệ. Hãy xác minh qua kênh Visora chính thức.", "Ein Code allein beweist nicht die Identität der Person. Prüfen Sie diese über einen offiziellen Visora-Kanal.", "Un código no prueba la identidad de quien te contacta. Verifícala por un canal oficial de Visora."],
    unavailable: ["Agent verification is temporarily unavailable. Please try again.", "代理人の確認は一時的に利用できません。もう一度お試しください。", "에이전트 확인을 일시적으로 이용할 수 없습니다. 다시 시도하세요.", "代理人验证暂时不可用，请重试。", "Không thể xác minh đại diện lúc này. Vui lòng thử lại.", "Die Agentenprüfung ist vorübergehend nicht verfügbar. Bitte versuchen Sie es erneut.", "La verificación de agentes no está disponible temporalmente. Inténtalo de nuevo."],
  };
  window.homeLanguageMessage = (key: string): string => {
    const options = messages[key];
    if (!options) throw new Error(`Missing home message: ${key}`);
    return options[languages.indexOf(picker.value as Language) + 1];
  };
  const input = document.querySelector<HTMLInputElement>("#agent-search-code");
  const attributes: [string, string, string[]][] = [
    [".home-carousel", "aria-label", ["写真とその背後にいる人々","사진과 사진 뒤의 사람들","摄影与背后的人","Nhiếp ảnh và những người phía sau","Fotografie und die Menschen dahinter","La fotografía y las personas detrás"]],
    ["[data-carousel-prev]", "aria-label", ["前の写真","이전 사진","上一张照片","Ảnh trước","Vorheriges Foto","Foto anterior"]],
    ["[data-carousel-next]", "aria-label", ["次の写真","다음 사진","下一张照片","Ảnh tiếp theo","Nächstes Foto","Foto siguiente"]],
    [".photo-slide:nth-child(1) img", "alt", ["カメラを持つ写真家のシルエット","카메라를 든 사진가의 실루엣","手持相机的摄影师剪影","Bóng nhiếp ảnh gia cầm máy ảnh","Silhouette eines Fotografen mit Kamera","Silueta de un fotógrafo con cámara"]],
    [".photo-slide:nth-child(2) img", "alt", ["風景写真に囲まれたカメラ","풍경 사진으로 둘러싸인 카메라","相机周围摆放着风景照片","Máy ảnh bên những bức ảnh phong cảnh","Kamera umgeben von Landschaftsfotos","Cámara rodeada de fotografías de paisajes"]],
    [".photo-slide:nth-child(3) img", "alt", ["テーブルに並んだカメラと森の写真","탁자 위의 카메라와 숲 사진","桌上的相机和森林照片","Máy ảnh và ảnh rừng trên bàn","Kamera und Waldfotos auf einem Tisch","Cámara y fotos de un bosque sobre una mesa"]],
    [".photo-stories-grid figure:nth-child(1) img", "alt", ["カメラを持つ写真家","카메라를 든 사진가","携带相机的摄影师","Nhiếp ảnh gia mang máy ảnh","Fotograf mit Kamera","Fotógrafo con cámara"]],
    [".photo-stories-grid figure:nth-child(2) img", "alt", ["写真とアルバムを並べる人","사진과 앨범을 정리하는 사람","整理照片和相册的人","Người sắp xếp ảnh và album","Person ordnet Fotoabzüge und Alben","Persona ordenando fotos y álbumes"]],
    [".photo-stories-grid figure:nth-child(3) img", "alt", ["人物、海岸、花のインスタント写真","인물, 해안, 꽃의 즉석 사진","人像、海岸和花朵的即时照片","Ảnh lấy ngay về chân dung, bờ biển và hoa","Sofortbilder eines Porträts, einer Küste und Blumen","Fotos instantáneas de un retrato, la costa y flores"]],
  ];
  const attributeNodes = isHome ? attributes.flatMap(([selector, attribute, translations]) => {
    const node = document.querySelector<HTMLElement>(selector);
    if (!node) return [];
    handled.add(node);
    return [{ node, attribute, original: node.getAttribute(attribute) ?? "", translations }];
  }) : [];

  // Page content keyed by its English text so every public page shares one mechanism.
  const T = (...values: string[]): string[] => values;
  const phrases: Record<string, string[]> = {
    "Home": T("ホーム","홈","首页","Trang chủ","Startseite","Inicio"),
    "Collection": T("コレクション","컬렉션","作品集","Bộ sưu tập","Kollektion","Colección"),
    "Photographers": T("写真家","사진가","摄影师","Nhiếp ảnh gia","Fotografen","Fotógrafos"),
    "About": T("私たちについて","소개","关于我们","Giới thiệu","Über uns","Nosotros"),
    "Previous photograph": T("前の写真","이전 사진","上一张照片","Ảnh trước","Vorheriges Foto","Foto anterior"),
    "Next photograph": T("次の写真","다음 사진","下一张照片","Ảnh tiếp theo","Nächstes Foto","Foto siguiente"),
    "Photography and the people behind it": T("写真とその背後にいる人々","사진과 사진 뒤의 사람들","摄影与背后的人","Nhiếp ảnh và những người phía sau","Fotografie und die Menschen dahinter","La fotografía y las personas detrás"),
    "Join Visora": T("Visoraに参加","Visora 가입","加入 Visora","Tham gia Visora","Visora beitreten","Únete a Visora"),
    "FOR PHOTOGRAPHERS": T("写真家の方へ","사진가를 위해","摄影师专区","DÀNH CHO NHIẾP ẢNH GIA","FÜR FOTOGRAFEN","PARA FOTÓGRAFOS"),
    "Loading...": T("読み込み中…","불러오는 중…","加载中…","Đang tải…","Wird geladen…","Cargando…"),
    "Loading gallery...": T("ギャラリーを読み込み中…","갤러리를 불러오는 중…","正在加载画廊…","Đang tải thư viện…","Galerie wird geladen…","Cargando la galería…"),
    "Load more photographs": T("さらに写真を読み込む","사진 더 불러오기","加载更多照片","Tải thêm ảnh","Weitere Fotos laden","Cargar más fotografías"),
    "No photographs have been published yet.": T("公開された写真はまだありません。","아직 게시된 사진이 없습니다.","尚无已发布的照片。","Chưa có ảnh nào được xuất bản.","Es wurden noch keine Fotos veröffentlicht.","Todavía no se ha publicado ninguna fotografía."),
    "Photograph is unavailable.": T("この写真は利用できません。","이 사진을 사용할 수 없습니다.","该照片不可用。","Ảnh này không khả dụng.","Dieses Foto ist nicht verfügbar.","La fotografía no está disponible."),
    "Could not load records.": T("データを読み込めませんでした。","기록을 불러올 수 없습니다.","无法加载记录。","Không thể tải dữ liệu.","Daten konnten nicht geladen werden.","No se pudieron cargar los registros."),
    "The server returned an invalid response.": T("サーバーから無効な応答が返されました。","서버가 올바르지 않은 응답을 반환했습니다.","服务器返回了无效响应。","Máy chủ trả về phản hồi không hợp lệ.","Der Server hat eine ungültige Antwort geliefert.","El servidor devolvió una respuesta no válida."),
    "Published photographs": T("公開された写真","게시된 사진","已发布的照片","Ảnh đã xuất bản","Veröffentlichte Fotos","Fotografías publicadas"),
    "Editorial imagery about photography": T("写真に関するエディトリアル画像","사진에 관한 에디토리얼 이미지","关于摄影的编辑图像","Hình ảnh biên tập về nhiếp ảnh","Redaktionelle Bilder über Fotografie","Imágenes editoriales sobre fotografía"),
    "Open menu": T("メニューを開く","메뉴 열기","打开菜单","Mở menu","Menü öffnen","Abrir menú"),
    "Close menu": T("メニューを閉じる","메뉴 닫기","关闭菜单","Đóng menu","Menü schließen","Cerrar menú"),
    // About
    "About Visora": T("Visoraについて","Visora 소개","关于 Visora","Về Visora","Über Visora","Acerca de Visora"),
    "ABOUT VISORA": T("VISORAについて","VISORA 소개","关于 VISORA","VỀ VISORA","ÜBER VISORA","ACERCA DE VISORA"),
    "A home for visual stories.": T("ビジュアルストーリーの拠り所。","시각적 이야기를 위한 공간.","视觉故事的家园。","Ngôi nhà của những câu chuyện hình ảnh.","Ein Zuhause für visuelle Geschichten.","Un hogar para las historias visuales."),
    "We are building an independent photography publishing platform designed to connect photographers, meaningful work and considered publishing opportunities.": T("私たちは、写真家、意味のある作品、そして丁寧な出版の機会をつなぐ独立系の写真出版プラットフォームを構築しています。","저희는 사진가, 의미 있는 작품, 그리고 신중한 출판 기회를 연결하는 독립 사진 출판 플랫폼을 만들고 있습니다.","我们正在打造一个独立的摄影出版平台，连接摄影师、有意义的作品与审慎的出版机会。","Chúng tôi đang xây dựng một nền tảng xuất bản nhiếp ảnh độc lập, kết nối nhiếp ảnh gia, tác phẩm ý nghĩa và các cơ hội xuất bản chu đáo.","Wir bauen eine unabhängige Fotografie-Publishing-Plattform auf, die Fotografen, bedeutungsvolle Arbeiten und sorgfältige Veröffentlichungsmöglichkeiten verbindet.","Estamos creando una plataforma independiente de publicación fotográfica que conecta a fotógrafos, obras significativas y oportunidades de publicación cuidadas."),
    "A hand holding a camera against the sky": T("空を背景にカメラを持つ手","하늘을 배경으로 카메라를 든 손","手持相机对着天空","Bàn tay cầm máy ảnh trước bầu trời","Eine Hand hält eine Kamera vor den Himmel","Una mano sostiene una cámara contra el cielo"),
    "THE PHOTOGRAPHER": T("写真家","사진가","摄影师","NHIẾP ẢNH GIA","DER FOTOGRAF","EL FOTÓGRAFO"),
    "Instant camera and family photographs": T("インスタントカメラと家族写真","즉석 카메라와 가족 사진","即时相机和家庭照片","Máy ảnh lấy liền và ảnh gia đình","Sofortbildkamera und Familienfotos","Cámara instantánea y fotografías familiares"),
    "THE STORIES WE SHARE": T("私たちが共有する物語","우리가 나누는 이야기","我们分享的故事","NHỮNG CÂU CHUYỆN TA CHIA SẺ","DIE GESCHICHTEN, DIE WIR TEILEN","LAS HISTORIAS QUE COMPARTIMOS"),
    "OUR PURPOSE": T("私たちの目的","우리의 목적","我们的宗旨","MỤC ĐÍCH CỦA CHÚNG TÔI","UNSER ZWECK","NUESTRO PROPÓSITO"),
    "Photography is more than an image.": T("写真は単なる画像ではありません。","사진은 단순한 이미지 이상입니다.","摄影不只是一张图像。","Nhiếp ảnh không chỉ là một bức ảnh.","Fotografie ist mehr als ein Bild.","La fotografía es más que una imagen."),
    "Behind every photograph is a perspective, a moment and a person who made the decision to preserve it. Visora is being developed to give those photographs a thoughtful path from submission to potential acquisition and publication.": T("すべての写真の背後には、視点と瞬間、そしてそれを残そうと決めた人がいます。Visoraは、そうした写真に、提出から購入・出版の可能性まで続く丁寧な道筋を提供するために開発されています。","모든 사진 뒤에는 하나의 시선과 순간, 그리고 그것을 간직하기로 결정한 사람이 있습니다. Visora는 그런 사진들이 제출에서 인수 및 출판 가능성까지 이어지는 세심한 길을 갖도록 개발되고 있습니다.","每张照片背后都有一种视角、一个瞬间，以及决定留住它的人。Visora 的开发，旨在为这些照片提供从投稿到潜在收购与出版的周到路径。","Đằng sau mỗi bức ảnh là một góc nhìn, một khoảnh khắc và một người đã quyết định lưu giữ nó. Visora được phát triển để mang đến cho những bức ảnh ấy một lộ trình chu đáo từ khi gửi đến khả năng được mua và xuất bản.","Hinter jedem Foto stehen eine Perspektive, ein Moment und ein Mensch, der entschieden hat, ihn festzuhalten. Visora wird entwickelt, um diesen Fotos einen durchdachten Weg von der Einreichung bis zum möglichen Ankauf und zur Veröffentlichung zu bieten.","Detrás de cada fotografía hay una perspectiva, un momento y una persona que decidió conservarlo. Visora se desarrolla para ofrecer a esas fotografías un camino cuidado desde el envío hasta una posible adquisición y publicación."),
    "Our approach centres on considered review, clear permissions and proper photographer attribution. We want the relationship between the platform, the photographer and the work to be transparent.": T("私たちのアプローチは、丁寧な審査、明確な許可、適切な写真家のクレジットを軸としています。プラットフォーム、写真家、作品の関係が透明であることを目指しています。","우리의 접근 방식은 신중한 심사, 명확한 허가, 올바른 사진가 표기를 중심으로 합니다. 플랫폼, 사진가, 작품 사이의 관계가 투명하기를 바랍니다.","我们的方式以审慎的审核、明确的授权和恰当的摄影师署名为核心。我们希望平台、摄影师与作品之间的关系保持透明。","Cách tiếp cận của chúng tôi tập trung vào xét duyệt chu đáo, quyền sử dụng rõ ràng và ghi công nhiếp ảnh gia đúng cách. Chúng tôi muốn mối quan hệ giữa nền tảng, nhiếp ảnh gia và tác phẩm minh bạch.","Unser Ansatz beruht auf sorgfältiger Prüfung, klaren Rechten und korrekter Urheberangabe. Das Verhältnis zwischen Plattform, Fotograf und Werk soll transparent sein.","Nuestro enfoque se centra en una revisión cuidadosa, permisos claros y la atribución correcta del fotógrafo. Queremos que la relación entre la plataforma, el fotógrafo y la obra sea transparente."),
    "COMPANY INFORMATION": T("会社情報","회사 정보","公司信息","THÔNG TIN CÔNG TY","UNTERNEHMENSINFORMATIONEN","INFORMACIÓN DE LA EMPRESA"),
    "Built with an international outlook.": T("国際的な視野で築かれています。","국제적인 관점으로 만들어졌습니다.","以国际视野打造。","Được xây dựng với tầm nhìn quốc tế.","Mit internationalem Blick aufgebaut.","Creada con una visión internacional."),
    "Visora is registered in the United Kingdom and is an affiliate of Bexhill Photographic Limited.": T("Visoraは英国で登録されており、Bexhill Photographic Limitedの関連会社です。","Visora는 영국에 등록되어 있으며 Bexhill Photographic Limited의 계열사입니다.","Visora 在英国注册，是 Bexhill Photographic Limited 的关联公司。","Visora được đăng ký tại Vương quốc Anh và là công ty liên kết của Bexhill Photographic Limited.","Visora ist im Vereinigten Königreich registriert und ein verbundenes Unternehmen der Bexhill Photographic Limited.","Visora está registrada en el Reino Unido y es una filial de Bexhill Photographic Limited."),
    "Bexhill Photographic Limited was incorporated in May 2003, with company number 04752835. It is based in East Sussex, with an office at 31 Sackville Road, Bexhill-on-Sea, East Sussex, TN39 3JD.": T("Bexhill Photographic Limitedは2003年5月に設立され、会社番号は<strong>04752835</strong>です。本社はイースト・サセックスにあり、事務所の所在地は31 Sackville Road, Bexhill-on-Sea, East Sussex, TN39 3JDです。","Bexhill Photographic Limited는 2003년 5월에 설립되었으며 회사 번호는 <strong>04752835</strong>입니다. 이스트서식스에 위치하며 사무실 주소는 31 Sackville Road, Bexhill-on-Sea, East Sussex, TN39 3JD입니다.","Bexhill Photographic Limited 成立于 2003 年 5 月，公司编号为 <strong>04752835</strong>。公司位于东萨塞克斯郡，办公地址为 31 Sackville Road, Bexhill-on-Sea, East Sussex, TN39 3JD。","Bexhill Photographic Limited được thành lập vào tháng 5 năm 2003, số công ty <strong>04752835</strong>. Công ty đặt tại East Sussex, văn phòng tại 31 Sackville Road, Bexhill-on-Sea, East Sussex, TN39 3JD.","Die Bexhill Photographic Limited wurde im Mai 2003 gegründet und hat die Firmennummer <strong>04752835</strong>. Sie hat ihren Sitz in East Sussex, mit Büro in 31 Sackville Road, Bexhill-on-Sea, East Sussex, TN39 3JD.","Bexhill Photographic Limited se constituyó en mayo de 2003, con número de empresa <strong>04752835</strong>. Tiene su sede en East Sussex, con oficina en 31 Sackville Road, Bexhill-on-Sea, East Sussex, TN39 3JD."),
    "THE VISORA APPROACH": T("VISORAのアプローチ","VISORA의 접근 방식","VISORA 的理念","CÁCH TIẾP CẬN CỦA VISORA","DER VISORA-ANSATZ","EL ENFOQUE DE VISORA"),
    "Thoughtful work. Clear relationships.": T("思慮深い仕事。明確な関係。","사려 깊은 작업. 명확한 관계.","用心的工作，清晰的关系。","Công việc chu đáo. Mối quan hệ rõ ràng.","Durchdachte Arbeit. Klare Beziehungen.","Trabajo reflexivo. Relaciones claras."),
    "We believe photographers should understand how their work is reviewed, how permissions are handled and how their contributions are credited.": T("写真家は、作品がどのように審査され、許可がどう扱われ、貢献がどのようにクレジットされるかを理解できるべきだと私たちは考えています。","사진가는 자신의 작품이 어떻게 심사되는지, 허가가 어떻게 처리되는지, 기여가 어떻게 표기되는지 이해할 수 있어야 한다고 믿습니다.","我们相信，摄影师应当了解作品如何被审核、授权如何处理，以及贡献如何署名。","Chúng tôi tin rằng nhiếp ảnh gia nên hiểu tác phẩm được xét duyệt thế nào, quyền sử dụng được xử lý ra sao và đóng góp được ghi công như thế nào.","Wir sind überzeugt, dass Fotografen verstehen sollten, wie ihre Arbeit geprüft wird, wie Rechte gehandhabt werden und wie ihre Beiträge genannt werden.","Creemos que los fotógrafos deben entender cómo se revisa su trabajo, cómo se gestionan los permisos y cómo se acreditan sus contribuciones."),
    "Discover the platform": T("プラットフォームを知る","플랫폼 알아보기","了解平台","Khám phá nền tảng","Plattform entdecken","Descubre la plataforma"),
    // Collection
    "Collection | Visora": T("コレクション | Visora","컬렉션 | Visora","作品集 | Visora","Bộ sưu tập | Visora","Kollektion | Visora","Colección | Visora"),
    "THE VISORA COLLECTION": T("VISORAコレクション","VISORA 컬렉션","VISORA 作品集","BỘ SƯU TẬP VISORA","DIE VISORA-KOLLEKTION","LA COLECCIÓN VISORA"),
    "Perspectives worth keeping.": T("残す価値のある視点。","간직할 가치가 있는 시선.","值得珍藏的视角。","Những góc nhìn đáng lưu giữ.","Perspektiven, die es wert sind, bewahrt zu werden.","Perspectivas que merece la pena conservar."),
    "A growing collection of photography selected for its perspective, craft and story.": T("視点、技術、物語の観点から選ばれた、成長を続ける写真コレクション。","시선, 완성도, 이야기를 기준으로 선별한, 계속 성장하는 사진 컬렉션.","一个不断增长的摄影合集，依据视角、技艺与故事精心挑选。","Bộ sưu tập nhiếp ảnh ngày càng lớn, được chọn lọc theo góc nhìn, kỹ thuật và câu chuyện.","Eine wachsende Fotosammlung, ausgewählt nach Perspektive, Handwerk und Geschichte.","Una colección fotográfica en crecimiento, seleccionada por su perspectiva, oficio e historia."),
    "Camera and instant photographs in a warm setting": T("温かみのある空間にあるカメラとインスタント写真","따뜻한 분위기 속의 카메라와 즉석 사진","温暖环境中的相机与即时照片","Máy ảnh và ảnh lấy liền trong không gian ấm áp","Kamera und Sofortbilder in warmer Umgebung","Cámara y fotos instantáneas en un ambiente cálido"),
    "EDITORIAL IMAGERY / THE CAMERA": T("エディトリアル画像 / カメラ","에디토리얼 이미지 / 카메라","编辑图像 / 相机","HÌNH ẢNH BIÊN TẬP / MÁY ẢNH","REDAKTIONELLE BILDER / DIE KAMERA","IMÁGENES EDITORIALES / LA CÁMARA"),
    "Hand holding three instant photographs": T("3枚のインスタント写真を持つ手","즉석 사진 세 장을 든 손","手持三张即时照片","Bàn tay cầm ba bức ảnh lấy liền","Hand mit drei Sofortbildern","Mano sosteniendo tres fotos instantáneas"),
    "EDITORIAL IMAGERY / THE COLLECTION": T("エディトリアル画像 / コレクション","에디토리얼 이미지 / 컬렉션","编辑图像 / 作品集","HÌNH ẢNH BIÊN TẬP / BỘ SƯU TẬP","REDAKTIONELLE BILDER / DIE KOLLEKTION","IMÁGENES EDITORIALES / LA COLECCIÓN"),
    "COLLECTION / 001": T("コレクション / 001","컬렉션 / 001","作品集 / 001","BỘ SƯU TẬP / 001","KOLLEKTION / 001","COLECCIÓN / 001"),
    "The collection is taking shape.": T("コレクションは形になりつつあります。","컬렉션이 형태를 갖춰 가고 있습니다.","作品集正在成形。","Bộ sưu tập đang dần thành hình.","Die Kollektion nimmt Gestalt an.","La colección está tomando forma."),
    "Photographs will appear here after review, rights clearance and publication approval. We believe every image deserves accurate attribution and a clear story.": T("写真は、審査、権利の確認、出版承認を経てここに掲載されます。すべての画像に正確なクレジットと明確な物語がふさわしいと私たちは考えています。","사진은 심사, 권리 확인 및 출판 승인 후 이곳에 표시됩니다. 모든 이미지에는 정확한 표기와 분명한 이야기가 있어야 한다고 믿습니다.","照片将在审核、版权确认和出版批准后出现在这里。我们相信每张图像都值得准确的署名和清晰的故事。","Ảnh sẽ xuất hiện tại đây sau khi được xét duyệt, xác nhận quyền và phê duyệt xuất bản. Chúng tôi tin mỗi bức ảnh xứng đáng được ghi công chính xác và có một câu chuyện rõ ràng.","Fotos erscheinen hier nach Prüfung, Rechteklärung und Veröffentlichungsfreigabe. Wir glauben, dass jedes Bild eine korrekte Urheberangabe und eine klare Geschichte verdient.","Las fotografías aparecerán aquí tras la revisión, la autorización de derechos y la aprobación de publicación. Creemos que cada imagen merece una atribución precisa y una historia clara."),
    "Share your photography": T("あなたの写真を共有する","내 사진 공유하기","分享您的摄影作品","Chia sẻ ảnh của bạn","Teilen Sie Ihre Fotografie","Comparte tu fotografía"),
    // Gallery
    "Gallery | Visora": T("ギャラリー | Visora","갤러리 | Visora","画廊 | Visora","Thư viện | Visora","Galerie | Visora","Galería | Visora"),
    "VISORA GALLERY": T("VISORAギャラリー","VISORA 갤러리","VISORA 画廊","THƯ VIỆN VISORA","VISORA-GALERIE","GALERÍA VISORA"),
    "Photography, shared.": T("共有される写真。","함께 나누는 사진.","分享摄影。","Nhiếp ảnh, được chia sẻ.","Fotografie, geteilt.","Fotografía, compartida."),
    "Works shared with permission from their photographers.": T("写真家の許可を得て共有された作品。","사진가의 허락을 받아 공유된 작품.","经摄影师许可分享的作品。","Tác phẩm được chia sẻ với sự cho phép của nhiếp ảnh gia.","Mit Erlaubnis der Fotografen geteilte Werke.","Obras compartidas con permiso de sus fotógrafos."),
    "Cameras, film and portrait photographs arranged on a table": T("テーブルに並んだカメラ、フィルム、ポートレート写真","탁자 위에 놓인 카메라, 필름, 인물 사진","桌上摆放的相机、胶片和人像照片","Máy ảnh, phim và ảnh chân dung bày trên bàn","Kameras, Filme und Porträtfotos auf einem Tisch","Cámaras, película y retratos dispuestos sobre una mesa"),
    "EDITORIAL IMAGERY / BEHIND THE LENS": T("エディトリアル画像 / レンズの裏側","에디토리얼 이미지 / 렌즈 뒤","编辑图像 / 镜头背后","HÌNH ẢNH BIÊN TẬP / SAU ỐNG KÍNH","REDAKTIONELLE BILDER / HINTER DEM OBJEKTIV","IMÁGENES EDITORIALES / TRAS EL OBJETIVO"),
    "Cameras and instant portraits arranged on a wooden surface": T("木製の台に並んだカメラとインスタントのポートレート","나무 표면에 놓인 카메라와 즉석 인물 사진","木质表面上摆放的相机和即时人像","Máy ảnh và ảnh chân dung lấy liền trên mặt gỗ","Kameras und Sofortbild-Porträts auf einer Holzfläche","Cámaras y retratos instantáneos sobre una superficie de madera"),
    "EDITORIAL IMAGERY / PORTRAITS": T("エディトリアル画像 / ポートレート","에디토리얼 이미지 / 인물 사진","编辑图像 / 人像","HÌNH ẢNH BIÊN TẬP / CHÂN DUNG","REDAKTIONELLE BILDER / PORTRÄTS","IMÁGENES EDITORIALES / RETRATOS"),
    // Photographers
    "For Photographers | Visora": T("写真家の方へ | Visora","사진가를 위해 | Visora","摄影师专区 | Visora","Dành cho nhiếp ảnh gia | Visora","Für Fotografen | Visora","Para fotógrafos | Visora"),
    "Your work. Your perspective.": T("あなたの作品。あなたの視点。","당신의 작품. 당신의 시선.","您的作品，您的视角。","Tác phẩm của bạn. Góc nhìn của bạn.","Ihre Arbeit. Ihre Perspektive.","Tu trabajo. Tu perspectiva."),
    "A dedicated workspace to organise your photography, submit work for consideration and follow its progress.": T("写真を整理し、作品を審査に提出し、その進捗を確認できる専用ワークスペース。","사진을 정리하고, 작품을 심사에 제출하고, 진행 상황을 확인할 수 있는 전용 작업 공간.","专属工作空间，用于整理摄影作品、提交审核并跟踪进度。","Không gian làm việc riêng để sắp xếp ảnh, gửi tác phẩm xét duyệt và theo dõi tiến trình.","Ein eigener Arbeitsbereich, um Ihre Fotografie zu ordnen, Arbeiten zur Prüfung einzureichen und den Fortschritt zu verfolgen.","Un espacio de trabajo dedicado para organizar tu fotografía, enviar obras a revisión y seguir su progreso."),
    "Create an account": T("アカウントを作成","계정 만들기","创建账户","Tạo tài khoản","Konto erstellen","Crea una cuenta"),
    "Already a member? Sign in": T("すでに会員の方はログイン","이미 회원이신가요? 로그인","已是会员？登录","Đã là thành viên? Đăng nhập","Schon Mitglied? Anmelden","¿Ya eres miembro? Inicia sesión"),
    "Camera and lenses arranged on a dark surface": T("暗い面に並んだカメラとレンズ","어두운 표면에 놓인 카메라와 렌즈","深色表面上摆放的相机和镜头","Máy ảnh và ống kính trên bề mặt tối","Kamera und Objektive auf dunklem Untergrund","Cámara y objetivos sobre una superficie oscura"),
    "YOUR PERSPECTIVE": T("あなたの視点","당신의 시선","您的视角","GÓC NHÌN CỦA BẠN","IHRE PERSPEKTIVE","TU PERSPECTIVA"),
    "Camera equipment and laptop on a desk": T("机の上のカメラ機材とノートパソコン","책상 위의 카메라 장비와 노트북","桌上的摄影器材和笔记本电脑","Thiết bị máy ảnh và laptop trên bàn","Kameraausrüstung und Laptop auf einem Schreibtisch","Equipo fotográfico y portátil sobre un escritorio"),
    "YOUR WORKSPACE": T("あなたのワークスペース","당신의 작업 공간","您的工作空间","KHÔNG GIAN LÀM VIỆC CỦA BẠN","IHR ARBEITSBEREICH","TU ESPACIO DE TRABAJO"),
    "Build your portfolio": T("ポートフォリオを作る","포트폴리오 만들기","建立您的作品集","Xây dựng danh mục của bạn","Portfolio aufbauen","Crea tu portafolio"),
    "Upload and organise photographs in your private portfolio. You remain in control of what you choose to submit.": T("非公開のポートフォリオに写真をアップロードして整理できます。何を提出するかは常にあなたが決めます。","비공개 포트폴리오에 사진을 업로드하고 정리하세요. 무엇을 제출할지는 언제나 직접 결정합니다.","在您的私人作品集中上传并整理照片。提交什么内容始终由您掌控。","Tải lên và sắp xếp ảnh trong danh mục riêng. Bạn luôn toàn quyền quyết định nội dung gửi đi.","Laden Sie Fotos in Ihr privates Portfolio hoch und ordnen Sie sie. Sie behalten die Kontrolle darüber, was Sie einreichen.","Sube y organiza fotografías en tu portafolio privado. Tú controlas qué decides enviar."),
    "Submit your work": T("作品を提出する","작품 제출하기","提交您的作品","Gửi tác phẩm của bạn","Arbeiten einreichen","Envía tu trabajo"),
    "Submit individual photographs or collections for review and potential acquisition or publication.": T("写真やコレクションを審査に提出し、購入や出版の可能性につなげます。","개별 사진이나 컬렉션을 심사에 제출하여 인수 또는 출판 가능성을 열어 보세요.","提交单张照片或合集以供审核，并有机会被收购或出版。","Gửi ảnh riêng lẻ hoặc bộ sưu tập để xét duyệt và có thể được mua hoặc xuất bản.","Reichen Sie einzelne Fotos oder Kollektionen zur Prüfung und für einen möglichen Ankauf oder eine Veröffentlichung ein.","Envía fotografías individuales o colecciones para su revisión y posible adquisición o publicación."),
    "Follow the process": T("進行状況を確認する","진행 과정 확인하기","跟踪进度","Theo dõi quy trình","Den Prozess verfolgen","Sigue el proceso"),
    "Use your account workspace to follow submission status and review updates.": T("アカウントのワークスペースで、提出状況や審査の更新を確認できます。","계정 작업 공간에서 제출 상태와 심사 업데이트를 확인하세요.","在账户工作空间中跟踪投稿状态和审核更新。","Dùng không gian làm việc của tài khoản để theo dõi trạng thái gửi và cập nhật xét duyệt.","Verfolgen Sie in Ihrem Arbeitsbereich den Einreichungsstatus und Prüfungsupdates.","Usa el espacio de trabajo de tu cuenta para seguir el estado de tus envíos y las novedades de la revisión."),
    "YOUR PHOTOGRAPHY, YOUR RIGHTS": T("あなたの写真、あなたの権利","당신의 사진, 당신의 권리","您的摄影，您的权利","ẢNH CỦA BẠN, QUYỀN CỦA BẠN","IHRE FOTOGRAFIE, IHRE RECHTE","TU FOTOGRAFÍA, TUS DERECHOS"),
    "Clear permissions. Proper recognition.": T("明確な許可。適切なクレジット。","명확한 허가. 올바른 표기.","清晰的授权，恰当的署名。","Quyền sử dụng rõ ràng. Ghi công đúng cách.","Klare Rechte. Angemessene Anerkennung.","Permisos claros. Reconocimiento adecuado."),
    "Uploading or submitting a photograph does not by itself transfer copyright or grant publication rights. Any acquisition or publication arrangement must be clearly agreed.": T("写真をアップロードまたは提出するだけでは、著作権の譲渡や出版権の付与にはなりません。購入や出版に関する取り決めは明確に合意される必要があります。","사진을 업로드하거나 제출하는 것만으로 저작권이 이전되거나 출판 권리가 부여되지는 않습니다. 인수 또는 출판 합의는 명확히 이루어져야 합니다.","仅上传或提交照片本身并不转让版权，也不授予出版权。任何收购或出版安排都必须明确约定。","Việc tải lên hoặc gửi ảnh tự nó không chuyển giao bản quyền hay cấp quyền xuất bản. Mọi thỏa thuận mua hoặc xuất bản phải được thống nhất rõ ràng.","Das Hochladen oder Einreichen eines Fotos überträgt für sich genommen weder das Urheberrecht noch Veröffentlichungsrechte. Jede Ankaufs- oder Veröffentlichungsvereinbarung muss klar vereinbart werden.","Subir o enviar una fotografía no transfiere por sí solo los derechos de autor ni concede derechos de publicación. Cualquier acuerdo de adquisición o publicación debe pactarse de forma clara."),
  };
  const normalise = (html: string): string => html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const textTargets = "main :is(h1,h2,h3,p,a,span,figcaption,button,label), .site-footer a";
  const textState = new WeakMap<Element, { original: string; applied: string }>();
  const attrState = new WeakMap<Element, Record<string, { original: string; applied: string }>>();
  const applyPhrases = (index: number): void => {
    document.querySelectorAll<HTMLElement>(textTargets).forEach((el) => {
      if (handled.has(el) || el.hasAttribute("data-carousel-status") || el.closest("[data-carousel-status]")) return;
      const record = textState.get(el);
      const original = record && el.innerHTML === record.applied ? record.original : el.innerHTML;
      const options = phrases[normalise(original)];
      if (!options) return;
      const next = index < 0 ? original : options[index];
      if (el.innerHTML !== next) el.innerHTML = next;
      textState.set(el, { original, applied: el.innerHTML });
    });
    document.querySelectorAll<HTMLElement>("[aria-label], img[alt]").forEach((el) => {
      if (handled.has(el)) return;
      const states = attrState.get(el) ?? {};
      ["aria-label", "alt"].forEach((attribute) => {
        const current = el.getAttribute(attribute);
        if (current === null) return;
        const record = states[attribute];
        const original = record && current === record.applied ? record.original : current;
        const options = phrases[original];
        if (!options) return;
        const next = index < 0 ? original : options[index];
        if (current !== next) el.setAttribute(attribute, next);
        states[attribute] = { original, applied: next };
      });
      attrState.set(el, states);
    });
  };
  const originalTitle = document.title;
  window.siteMenuLabel = (open: boolean): string => {
    const options = phrases[open ? "Close menu" : "Open menu"];
    const index = languages.indexOf(picker.value as Language);
    return index < 0 ? (open ? "Close menu" : "Open menu") : options[index];
  };
  const languageLabel = document.querySelector<HTMLElement>(".language-picker span");
  const languageNames = ["Language","言語","언어","语言","Ngôn ngữ","Sprache","Idioma"];
  const themeLabels = {
    dark: ["Dark mode","ダークモード","다크 모드","深色模式","Chế độ tối","Dunkelmodus","Modo oscuro"],
    light: ["Light mode","ライトモード","라이트 모드","浅色模式","Chế độ sáng","Hellmodus","Modo claro"],
  };
  const themeActions = {
    dark: ["Switch to dark mode","ダークモードに切り替え","다크 모드로 전환","切换到深色模式","Chuyển sang chế độ tối","Zum Dunkelmodus wechseln","Cambiar al modo oscuro"],
    light: ["Switch to light mode","ライトモードに切り替え","라이트 모드로 전환","切换到浅色模式","Chuyển sang chế độ sáng","Zum Hellmodus wechseln","Cambiar al modo claro"],
  };
  const translateTheme = (): void => {
    const index = languages.indexOf(picker.value as Language) + 1;
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    const button = document.querySelector<HTMLButtonElement>("[data-theme-toggle]");
    const label = button?.querySelector<HTMLElement>("[data-theme-label]");
    if (button) button.setAttribute("aria-label", themeActions[next][index]);
    if (label) label.textContent = themeLabels[next][index];
  };
  const apply = (value: string): void => {
    const index = languages.indexOf(value as Language);
    nodes.forEach(({ node, original, translations }) => {
      if (index < 0) node.innerHTML = original;
      else node.textContent = translations[index];
    });
    attributeNodes.forEach(({ node, attribute, original, translations }) => node.setAttribute(attribute, index < 0 ? original : translations[index]));
    document.documentElement.lang = index < 0 ? "en" : languages[index];
    if (input) input.placeholder = index < 0 ? "Search agent number / agent code" : placeholders[index];
    if (languageLabel) languageLabel.textContent = languageNames[index + 1];
    picker.setAttribute("aria-label", languageNames[index + 1]);
    translateTheme();
    applyPhrases(index);
    const heading = phrases[originalTitle];
    if (heading) document.title = index < 0 ? originalTitle : heading[index];
    const menuToggle = document.querySelector<HTMLElement>("[data-menu-toggle]");
    if (menuToggle) menuToggle.setAttribute("aria-label", window.siteMenuLabel!(menuToggle.getAttribute("aria-expanded") === "true"));
    document.documentElement.lang = index < 0 ? "en" : languages[index];
    document.dispatchEvent(new Event("home-language-changed"));
  };
  picker.addEventListener("change", () => {
    apply(picker.value);
    try { localStorage.setItem("visora-home-language", picker.value); }
    catch (error) { console.warn("Language preference could not be saved.", error); }
  });
  const isSupported = (value: unknown): value is string =>
    value === "en" || languages.some(language => language === value);
  const fromBrowser = (): string | null => {
    for (const tag of navigator.languages || [navigator.language]) {
      const code = (tag || "").toLowerCase().split("-")[0];
      if (isSupported(code)) return code;
    }
    return null;
  };
  const autoDetect = async (): Promise<void> => {
    let detected: string | null = null;
    const host = window.location.hostname;
    const base = host === "localhost" || host === "127.0.0.1" ? "http://127.0.0.1:8000" : "/api";
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 2500);
      const response = await fetch(`${base}/public/locale`, { cache: "no-store", signal: controller.signal });
      window.clearTimeout(timer);
      if (response.ok) {
        const data = await response.json();
        if (isSupported(data.language)) detected = data.language;
      }
    } catch (error) { console.warn("IP-based language detection is unavailable.", error); }
    detected = detected || fromBrowser();
    // A manual choice made while detection was running wins.
    try { if (localStorage.getItem("visora-home-language")) return; } catch { /* ignore */ }
    if (detected && detected !== "en") {
      picker.value = detected;
      apply(detected);
    }
  };
  try {
    const saved = localStorage.getItem("visora-home-language");
    if (saved && isSupported(saved)) {
      picker.value = saved;
      apply(saved);
    } else {
      void autoDetect();
    }
  } catch (error) { console.warn("Language preference could not be read.", error); }
  new MutationObserver(translateTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  // Content that main.ts loads later (for example the public gallery) is translated as it arrives.
  const dynamicRoots = document.querySelectorAll("#public-gallery-status, #public-gallery");
  if (dynamicRoots.length) {
    const dynamicObserver = new MutationObserver(() => {
      dynamicObserver.disconnect();
      applyPhrases(languages.indexOf(picker.value as Language));
      dynamicRoots.forEach((root) => dynamicObserver.observe(root, { childList: true, characterData: true, subtree: true }));
    });
    dynamicRoots.forEach((root) => dynamicObserver.observe(root, { childList: true, characterData: true, subtree: true }));
  }
  document.addEventListener("DOMContentLoaded", translateTheme);
})();
