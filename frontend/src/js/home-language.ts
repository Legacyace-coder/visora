interface Window {
  homeLanguageMessage?: (key: string) => string;
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
    [".footer-links a:nth-child(1)", ["ホーム","홈","首页","Trang chủ","Startseite","Inicio"]],
    [".footer-links a:nth-child(2)", ["コレクション","컬렉션","作品集","Bộ sưu tập","Kollektion","Colección"]],
    [".footer-links a:nth-child(3)", ["写真家","사진가","摄影师","Nhiếp ảnh gia","Fotografen","Fotógrafos"]],
    [".footer-links a:nth-child(4)", ["私たちについて","소개","关于我们","Giới thiệu","Über uns","Nosotros"]],
  ];
  const nodes = entries.map(([selector, translations]) => {
    const node = document.querySelector<HTMLElement>(selector);
    if (!node || translations.length !== languages.length) throw new Error(`Missing home translation: ${selector}`);
    return { node, original: node.innerHTML, translations };
  });
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
  const attributeNodes = attributes.map(([selector, attribute, translations]) => {
    const node = document.querySelector<HTMLElement>(selector);
    if (!node) throw new Error(`Missing home translation: ${selector}`);
    return { node, attribute, original: node.getAttribute(attribute) ?? "", translations };
  });
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
  document.addEventListener("DOMContentLoaded", translateTheme);
})();
