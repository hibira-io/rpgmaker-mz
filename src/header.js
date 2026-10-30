/*:
 * @target MZ
 * @plugindesc Online play on Hibira: other players on the map, chat, shared switches and variables, and your own events between players.
 * @author Hibira
 * @url https://github.com/hibira-io/rpgmaker-mz
 *
 * @help
 * Players in the same room see each other walk around the map, can chat,
 * and share the switches and variables you choose. Rooms run on Hibira, a
 * hosted realtime service (Pusher Channels protocol); there is no game server
 * to run, only a small auth endpoint that signs room subscriptions.
 *
 * Setup
 * 1. Create a free app at https://hibira.io/portal and turn on
 *    "Allow client events" in its settings.
 * 2. Deploy an auth endpoint, for example the Cloudflare Worker in the
 *    plugin's server/ folder (free), with your app key and secret.
 * 3. Set App key and Auth endpoint below. Never put the secret in the game.
 * 4. Call the plugin command "Join room" from an event, with a room name
 *    (any text; players with the same name meet).
 *
 * Script calls
 *   HibiraOnline.join('town')   HibiraOnline.leave()
 *   HibiraOnline.say('hello')   HibiraOnline.sendEvent('boss', 3)
 *   HibiraOnline.members        (Map of other players: id -> { name, pos })
 *
 * Every player sends at most 8 messages a second. Each move, chat line,
 * switch change and event is one message on your Hibira plan.
 *
 * https://github.com/hibira-io/rpgmaker-mz
 *
 * @param appKey
 * @text App key
 * @desc The key of your Hibira app (not the secret).
 * @type string
 * @default 
 *
 * @param host
 * @text Host
 * @desc ws.hibira.io for the default cluster.
 * @type string
 * @default ws.hibira.io
 *
 * @param port
 * @text Port
 * @desc 443 with TLS.
 * @type number
 * @min 1
 * @max 65535
 * @default 443
 *
 * @param tls
 * @text TLS
 * @desc Use wss://. Turn off only for a local test server.
 * @type boolean
 * @default true
 *
 * @param authEndpoint
 * @text Auth endpoint
 * @desc URL that signs room subscriptions, such as your Cloudflare Worker.
 * @type string
 * @default 
 *
 * @param roomPrefix
 * @text Room channel prefix
 * @desc Rooms are presence channels named prefix + room name. Your auth endpoint must allow it.
 * @type string
 * @default presence-mz-
 *
 * @param nameVariable
 * @text Player name variable
 * @desc Variable holding the name others see. 0 uses the party leader's name.
 * @type variable
 * @default 0
 *
 * @param showGhosts
 * @text Show other players
 * @desc Show players in the same room on the same map.
 * @type boolean
 * @default true
 *
 * @param ghostOpacity
 * @text Other players' opacity
 * @desc 0 to 255.
 * @type number
 * @min 0
 * @max 255
 * @default 160
 *
 * @param showNames
 * @text Show names
 * @desc Draw names above other players.
 * @type boolean
 * @default true
 *
 * @param syncSwitches
 * @text Shared switches
 * @desc Switches that change for everyone in the room.
 * @type switch[]
 * @default []
 *
 * @param syncVariables
 * @text Shared variables
 * @desc Variables (numbers or text) that change for everyone in the room.
 * @type variable[]
 * @default []
 *
 * @param connectedSwitch
 * @text Connected switch
 * @desc Turned ON while in a room. 0 for none.
 * @type switch
 * @default 0
 *
 * @param membersVariable
 * @text Players variable
 * @desc Number of players in the room, you included. 0 for none.
 * @type variable
 * @default 0
 *
 * @param chatWindow
 * @text Chat window
 * @desc Show chat lines at the bottom of the map.
 * @type boolean
 * @default true
 *
 * @param chatLines
 * @text Chat lines
 * @desc How many lines the chat window shows.
 * @type number
 * @min 1
 * @max 10
 * @default 5
 *
 * @param chatSeconds
 * @text Chat seconds
 * @desc How long a chat line stays.
 * @type number
 * @min 1
 * @max 60
 * @default 8
 *
 * @command joinRoom
 * @text Join room
 * @desc Join a room. Leaves the current room first.
 *
 * @arg room
 * @text Room name
 * @desc Players with the same room name meet.
 * @type string
 * @default 
 *
 * @arg roomVariable
 * @text Room name variable
 * @desc Take the room name from this variable instead. 0 for none.
 * @type variable
 * @default 0
 *
 * @command leaveRoom
 * @text Leave room
 * @desc Leave the current room.
 *
 * @command sendChat
 * @text Send chat
 * @desc Send a chat line to the room.
 *
 * @arg text
 * @text Text
 * @type multiline_string
 * @default 
 *
 * @arg textVariable
 * @text Text variable
 * @desc Take the text from this variable instead. 0 for none.
 * @type variable
 * @default 0
 *
 * @command sendEvent
 * @text Send event
 * @desc Send your own event, with a value, to the other players.
 *
 * @arg name
 * @text Event name
 * @desc Any name, such as boss or trade.
 * @type string
 * @default 
 *
 * @arg valueVariable
 * @text Value variable
 * @desc Variable to send (Send event) or to store the received value in (On event). 0 for none.
 * @type variable
 * @default 0
 *
 * @command onEvent
 * @text On event
 * @desc When another player sends this event: store its value, store the sender's name, run a common event. Run once, for example from an autorun or parallel event at the start.
 *
 * @arg name
 * @text Event name
 * @desc Any name, such as boss or trade.
 * @type string
 * @default 
 *
 * @arg valueVariable
 * @text Value variable
 * @desc Variable to send (Send event) or to store the received value in (On event). 0 for none.
 * @type variable
 * @default 0
 *
 * @arg senderVariable
 * @text Sender name variable
 * @desc Store the sender's name here. 0 for none.
 * @type variable
 * @default 0
 *
 * @arg commonEvent
 * @text Common event
 * @desc Common event to run. 0 for none.
 * @type common_event
 * @default 0
 */

/*:ja
 * @target MZ
 * @plugindesc Hibira でオンラインプレイ：マップ上の他プレイヤー表示、チャット、スイッチ・変数の共有、プレイヤー間の独自イベント。
 * @author Hibira
 * @url https://github.com/hibira-io/rpgmaker-mz
 *
 * @help
 * 同じルームのプレイヤー同士で、マップを歩く姿が見え、チャットができ、
 * 指定したスイッチと変数を共有できます。ルームはホスト型リアルタイム
 * サービス Hibira（Pusher Channels 互換）で動くので、ゲームサーバーは
 * 不要です。必要なのはルームの購読に署名する小さな認証エンドポイントだけです。
 *
 * 設定
 * 1. https://hibira.io/portal で無料のアプリを作り、設定で
 *    「クライアントイベントを許可」をオンにします。
 * 2. 認証エンドポイントを用意します。例：プラグインの server/ フォルダに
 *    ある Cloudflare Worker（無料）に、アプリの key と secret を設定。
 * 3. 下の「App key」と「認証エンドポイント」を設定します。secret は
 *    ゲームに入れないでください。
 * 4. イベントからプラグインコマンド「ルームに参加」を実行します
 *    （ルーム名は自由。同じ名前のプレイヤー同士が出会います）。
 *
 * スクリプト
 *   HibiraOnline.join('town')   HibiraOnline.leave()
 *   HibiraOnline.say('こんにちは')   HibiraOnline.sendEvent('boss', 3)
 *   HibiraOnline.members        （他プレイヤーの Map：id -> { name, pos }）
 *
 * 送信は 1 プレイヤーあたり毎秒 8 件まで。移動・チャット・スイッチ変更・
 * イベントはそれぞれ Hibira のプランで 1 メッセージです。
 *
 * https://github.com/hibira-io/rpgmaker-mz
 *
 * @param appKey
 * @text App key
 * @desc Hibira アプリの key（secret ではありません）。
 * @type string
 * @default 
 *
 * @param host
 * @text ホスト
 * @desc デフォルトのクラスターは ws.hibira.io。
 * @type string
 * @default ws.hibira.io
 *
 * @param port
 * @text ポート
 * @desc TLS では 443。
 * @type number
 * @min 1
 * @max 65535
 * @default 443
 *
 * @param tls
 * @text TLS
 * @desc wss:// を使います。ローカルのテストサーバーのときだけオフに。
 * @type boolean
 * @default true
 *
 * @param authEndpoint
 * @text 認証エンドポイント
 * @desc ルームの購読に署名する URL（Cloudflare Worker など）。
 * @type string
 * @default 
 *
 * @param roomPrefix
 * @text ルームのチャンネル接頭辞
 * @desc ルームは「接頭辞＋ルーム名」の presence チャンネルです。認証エンドポイントで許可してください。
 * @type string
 * @default presence-mz-
 *
 * @param nameVariable
 * @text プレイヤー名の変数
 * @desc 他の人に見える名前を入れた変数。0 なら先頭のアクター名。
 * @type variable
 * @default 0
 *
 * @param showGhosts
 * @text 他プレイヤーを表示
 * @desc 同じルーム・同じマップのプレイヤーを表示します。
 * @type boolean
 * @default true
 *
 * @param ghostOpacity
 * @text 他プレイヤーの不透明度
 * @desc 0〜255。
 * @type number
 * @min 0
 * @max 255
 * @default 160
 *
 * @param showNames
 * @text 名前を表示
 * @desc 他プレイヤーの頭上に名前を表示します。
 * @type boolean
 * @default true
 *
 * @param syncSwitches
 * @text 共有スイッチ
 * @desc ルーム全員で同じ値になるスイッチ。
 * @type switch[]
 * @default []
 *
 * @param syncVariables
 * @text 共有変数
 * @desc ルーム全員で同じ値になる変数（数値または文字列）。
 * @type variable[]
 * @default []
 *
 * @param connectedSwitch
 * @text 接続中スイッチ
 * @desc ルームにいる間 ON。0 で無効。
 * @type switch
 * @default 0
 *
 * @param membersVariable
 * @text 人数の変数
 * @desc ルームの人数（自分を含む）。0 で無効。
 * @type variable
 * @default 0
 *
 * @param chatWindow
 * @text チャットウィンドウ
 * @desc マップ下部にチャットを表示します。
 * @type boolean
 * @default true
 *
 * @param chatLines
 * @text チャット行数
 * @desc 表示する行数。
 * @type number
 * @min 1
 * @max 10
 * @default 5
 *
 * @param chatSeconds
 * @text チャット表示秒数
 * @desc 1 行を表示しておく秒数。
 * @type number
 * @min 1
 * @max 60
 * @default 8
 *
 * @command joinRoom
 * @text ルームに参加
 * @desc ルームに参加します。参加中のルームからは先に退出します。
 *
 * @arg room
 * @text ルーム名
 * @desc 同じルーム名のプレイヤー同士が出会います。
 * @type string
 * @default 
 *
 * @arg roomVariable
 * @text ルーム名の変数
 * @desc この変数からルーム名を取ります。0 で無効。
 * @type variable
 * @default 0
 *
 * @command leaveRoom
 * @text ルームから退出
 * @desc 今のルームから退出します。
 *
 * @command sendChat
 * @text チャットを送信
 * @desc ルームにチャットを送ります。
 *
 * @arg text
 * @text テキスト
 * @type multiline_string
 * @default 
 *
 * @arg textVariable
 * @text テキストの変数
 * @desc この変数からテキストを取ります。0 で無効。
 * @type variable
 * @default 0
 *
 * @command sendEvent
 * @text イベントを送信
 * @desc 他のプレイヤーに独自のイベントを値つきで送ります。
 *
 * @arg name
 * @text イベント名
 * @desc boss、trade など自由な名前。
 * @type string
 * @default 
 *
 * @arg valueVariable
 * @text 値の変数
 * @desc 送る値（イベントを送信）または受け取った値を入れる変数（受信したら）。0 で無効。
 * @type variable
 * @default 0
 *
 * @command onEvent
 * @text イベントを受信したら
 * @desc 他のプレイヤーがこのイベントを送ったとき：値を変数に入れ、送信者名を入れ、コモンイベントを実行します。開始時の自動実行・並列処理などで一度だけ実行してください。
 *
 * @arg name
 * @text イベント名
 * @desc boss、trade など自由な名前。
 * @type string
 * @default 
 *
 * @arg valueVariable
 * @text 値の変数
 * @desc 送る値（イベントを送信）または受け取った値を入れる変数（受信したら）。0 で無効。
 * @type variable
 * @default 0
 *
 * @arg senderVariable
 * @text 送信者名の変数
 * @desc 送信者の名前を入れる変数。0 で無効。
 * @type variable
 * @default 0
 *
 * @arg commonEvent
 * @text コモンイベント
 * @desc 実行するコモンイベント。0 で無効。
 * @type common_event
 * @default 0
 */

/*:zh
 * @target MZ
 * @plugindesc 在 Hibira 上線上遊玩：地圖上顯示其他玩家、聊天、共用開關與變數，以及玩家之間的自訂事件。
 * @author Hibira
 * @url https://github.com/hibira-io/rpgmaker-mz
 *
 * @help
 * 同一個房間的玩家可以看到彼此在地圖上走動、互相聊天，並共用你指定的
 * 開關和變數。房間跑在託管即時服務 Hibira（相容 Pusher Channels）上，
 * 不需要架遊戲伺服器，只需要一個替房間訂閱簽名的小型認證端點。
 *
 * 設定
 * 1. 到 https://hibira.io/portal 免費建立 app，在設定中開啟
 *    「允許 client events」。
 * 2. 部署認證端點，例如外掛 server/ 資料夾裡的 Cloudflare Worker（免費），
 *    填入 app 的 key 和 secret。
 * 3. 在下方設定「App key」和「認證端點」。不要把 secret 放進遊戲裡。
 * 4. 在事件中執行外掛指令「加入房間」，房間名稱可自訂，名稱相同的玩家會相遇。
 *
 * 腳本
 *   HibiraOnline.join('town')   HibiraOnline.leave()
 *   HibiraOnline.say('你好')   HibiraOnline.sendEvent('boss', 3)
 *   HibiraOnline.members        （其他玩家的 Map：id -> { name, pos }）
 *
 * 每位玩家每秒最多送出 8 則。每次移動、聊天、開關變更和事件，
 * 各算 Hibira 方案中的 1 則訊息。
 *
 * https://github.com/hibira-io/rpgmaker-mz
 *
 * @param appKey
 * @text App key
 * @desc Hibira app 的 key（不是 secret）。
 * @type string
 * @default 
 *
 * @param host
 * @text 主機
 * @desc 預設叢集為 ws.hibira.io。
 * @type string
 * @default ws.hibira.io
 *
 * @param port
 * @text 連接埠
 * @desc 使用 TLS 時為 443。
 * @type number
 * @min 1
 * @max 65535
 * @default 443
 *
 * @param tls
 * @text TLS
 * @desc 使用 wss://。只有本地測試伺服器才關閉。
 * @type boolean
 * @default true
 *
 * @param authEndpoint
 * @text 認證端點
 * @desc 替房間訂閱簽名的網址，例如你的 Cloudflare Worker。
 * @type string
 * @default 
 *
 * @param roomPrefix
 * @text 房間頻道前綴
 * @desc 房間是名為「前綴＋房間名稱」的 presence 頻道，認證端點必須允許。
 * @type string
 * @default presence-mz-
 *
 * @param nameVariable
 * @text 玩家名稱變數
 * @desc 存放其他人看到的名字的變數。0 表示使用隊伍第一位角色的名字。
 * @type variable
 * @default 0
 *
 * @param showGhosts
 * @text 顯示其他玩家
 * @desc 顯示同房間、同地圖的玩家。
 * @type boolean
 * @default true
 *
 * @param ghostOpacity
 * @text 其他玩家不透明度
 * @desc 0 到 255。
 * @type number
 * @min 0
 * @max 255
 * @default 160
 *
 * @param showNames
 * @text 顯示名字
 * @desc 在其他玩家頭上顯示名字。
 * @type boolean
 * @default true
 *
 * @param syncSwitches
 * @text 共用開關
 * @desc 房間內所有人會同步的開關。
 * @type switch[]
 * @default []
 *
 * @param syncVariables
 * @text 共用變數
 * @desc 房間內所有人會同步的變數（數字或文字）。
 * @type variable[]
 * @default []
 *
 * @param connectedSwitch
 * @text 連線中開關
 * @desc 在房間內時為 ON。0 表示不使用。
 * @type switch
 * @default 0
 *
 * @param membersVariable
 * @text 人數變數
 * @desc 房間人數（含自己）。0 表示不使用。
 * @type variable
 * @default 0
 *
 * @param chatWindow
 * @text 聊天視窗
 * @desc 在地圖下方顯示聊天。
 * @type boolean
 * @default true
 *
 * @param chatLines
 * @text 聊天行數
 * @desc 聊天視窗顯示的行數。
 * @type number
 * @min 1
 * @max 10
 * @default 5
 *
 * @param chatSeconds
 * @text 聊天顯示秒數
 * @desc 每行聊天顯示的秒數。
 * @type number
 * @min 1
 * @max 60
 * @default 8
 *
 * @command joinRoom
 * @text 加入房間
 * @desc 加入房間，會先離開目前的房間。
 *
 * @arg room
 * @text 房間名稱
 * @desc 房間名稱相同的玩家會相遇。
 * @type string
 * @default 
 *
 * @arg roomVariable
 * @text 房間名稱變數
 * @desc 改從這個變數取得房間名稱。0 表示不使用。
 * @type variable
 * @default 0
 *
 * @command leaveRoom
 * @text 離開房間
 * @desc 離開目前的房間。
 *
 * @command sendChat
 * @text 送出聊天
 * @desc 送一行聊天到房間。
 *
 * @arg text
 * @text 文字
 * @type multiline_string
 * @default 
 *
 * @arg textVariable
 * @text 文字變數
 * @desc 改從這個變數取得文字。0 表示不使用。
 * @type variable
 * @default 0
 *
 * @command sendEvent
 * @text 送出事件
 * @desc 把自訂事件連同數值送給其他玩家。
 *
 * @arg name
 * @text 事件名稱
 * @desc 任意名稱，例如 boss、trade。
 * @type string
 * @default 
 *
 * @arg valueVariable
 * @text 數值變數
 * @desc 要送出的變數（送出事件），或存放收到數值的變數（收到事件時）。0 表示不使用。
 * @type variable
 * @default 0
 *
 * @command onEvent
 * @text 收到事件時
 * @desc 其他玩家送出這個事件時：把數值存進變數、存下送出者名字、執行公共事件。只需執行一次，例如在開始時的自動執行或並行處理事件中。
 *
 * @arg name
 * @text 事件名稱
 * @desc 任意名稱，例如 boss、trade。
 * @type string
 * @default 
 *
 * @arg valueVariable
 * @text 數值變數
 * @desc 要送出的變數（送出事件），或存放收到數值的變數（收到事件時）。0 表示不使用。
 * @type variable
 * @default 0
 *
 * @arg senderVariable
 * @text 送出者名稱變數
 * @desc 存放送出者名字的變數。0 表示不使用。
 * @type variable
 * @default 0
 *
 * @arg commonEvent
 * @text 公共事件
 * @desc 要執行的公共事件。0 表示不使用。
 * @type common_event
 * @default 0
 */

/*:ko
 * @target MZ
 * @plugindesc Hibira로 온라인 플레이: 맵 위의 다른 플레이어, 채팅, 스위치·변수 공유, 플레이어 간 사용자 이벤트.
 * @author Hibira
 * @url https://github.com/hibira-io/rpgmaker-mz
 *
 * @help
 * 같은 방에 있는 플레이어끼리 맵을 걸어 다니는 모습을 보고, 채팅하고,
 * 지정한 스위치와 변수를 공유합니다. 방은 호스팅 실시간 서비스 Hibira
 * (Pusher Channels 호환)에서 동작하므로 게임 서버가 필요 없습니다.
 * 방 구독에 서명하는 작은 인증 엔드포인트만 있으면 됩니다.
 *
 * 설정
 * 1. https://hibira.io/portal 에서 무료 앱을 만들고 설정에서
 *    "클라이언트 이벤트 허용"을 켭니다.
 * 2. 인증 엔드포인트를 배포합니다. 예: 플러그인 server/ 폴더의
 *    Cloudflare Worker(무료)에 앱의 key와 secret을 설정.
 * 3. 아래 App key와 인증 엔드포인트를 설정합니다. secret은 게임에 넣지 마세요.
 * 4. 이벤트에서 플러그인 명령 "방 참가"를 실행합니다(방 이름은 자유,
 *    같은 이름의 플레이어끼리 만납니다).
 *
 * 스크립트
 *   HibiraOnline.join('town')   HibiraOnline.leave()
 *   HibiraOnline.say('안녕')   HibiraOnline.sendEvent('boss', 3)
 *   HibiraOnline.members        (다른 플레이어 Map: id -> { name, pos })
 *
 * 플레이어당 초당 최대 8건을 보냅니다. 이동, 채팅, 스위치 변경, 이벤트는
 * 각각 Hibira 요금제의 메시지 1건입니다.
 *
 * https://github.com/hibira-io/rpgmaker-mz
 *
 * @param appKey
 * @text App key
 * @desc Hibira 앱의 key(secret 아님).
 * @type string
 * @default 
 *
 * @param host
 * @text 호스트
 * @desc 기본 클러스터는 ws.hibira.io.
 * @type string
 * @default ws.hibira.io
 *
 * @param port
 * @text 포트
 * @desc TLS는 443.
 * @type number
 * @min 1
 * @max 65535
 * @default 443
 *
 * @param tls
 * @text TLS
 * @desc wss://를 사용합니다. 로컬 테스트 서버일 때만 끄세요.
 * @type boolean
 * @default true
 *
 * @param authEndpoint
 * @text 인증 엔드포인트
 * @desc 방 구독에 서명하는 URL(Cloudflare Worker 등).
 * @type string
 * @default 
 *
 * @param roomPrefix
 * @text 방 채널 접두사
 * @desc 방은 "접두사+방 이름" presence 채널입니다. 인증 엔드포인트에서 허용해야 합니다.
 * @type string
 * @default presence-mz-
 *
 * @param nameVariable
 * @text 플레이어 이름 변수
 * @desc 다른 사람에게 보이는 이름이 든 변수. 0이면 파티 선두 액터 이름.
 * @type variable
 * @default 0
 *
 * @param showGhosts
 * @text 다른 플레이어 표시
 * @desc 같은 방, 같은 맵의 플레이어를 표시합니다.
 * @type boolean
 * @default true
 *
 * @param ghostOpacity
 * @text 다른 플레이어 불투명도
 * @desc 0~255.
 * @type number
 * @min 0
 * @max 255
 * @default 160
 *
 * @param showNames
 * @text 이름 표시
 * @desc 다른 플레이어 머리 위에 이름을 표시합니다.
 * @type boolean
 * @default true
 *
 * @param syncSwitches
 * @text 공유 스위치
 * @desc 방 안의 모두에게 같이 바뀌는 스위치.
 * @type switch[]
 * @default []
 *
 * @param syncVariables
 * @text 공유 변수
 * @desc 방 안의 모두에게 같이 바뀌는 변수(숫자 또는 문자).
 * @type variable[]
 * @default []
 *
 * @param connectedSwitch
 * @text 접속 스위치
 * @desc 방에 있는 동안 ON. 0이면 사용 안 함.
 * @type switch
 * @default 0
 *
 * @param membersVariable
 * @text 인원 변수
 * @desc 방 인원(자신 포함). 0이면 사용 안 함.
 * @type variable
 * @default 0
 *
 * @param chatWindow
 * @text 채팅 창
 * @desc 맵 아래에 채팅을 표시합니다.
 * @type boolean
 * @default true
 *
 * @param chatLines
 * @text 채팅 줄 수
 * @desc 표시할 줄 수.
 * @type number
 * @min 1
 * @max 10
 * @default 5
 *
 * @param chatSeconds
 * @text 채팅 표시 시간(초)
 * @desc 한 줄이 남아 있는 시간.
 * @type number
 * @min 1
 * @max 60
 * @default 8
 *
 * @command joinRoom
 * @text 방 참가
 * @desc 방에 참가합니다. 현재 방에서는 먼저 나갑니다.
 *
 * @arg room
 * @text 방 이름
 * @desc 같은 방 이름의 플레이어끼리 만납니다.
 * @type string
 * @default 
 *
 * @arg roomVariable
 * @text 방 이름 변수
 * @desc 이 변수에서 방 이름을 가져옵니다. 0이면 사용 안 함.
 * @type variable
 * @default 0
 *
 * @command leaveRoom
 * @text 방 나가기
 * @desc 현재 방에서 나갑니다.
 *
 * @command sendChat
 * @text 채팅 보내기
 * @desc 방에 채팅을 보냅니다.
 *
 * @arg text
 * @text 텍스트
 * @type multiline_string
 * @default 
 *
 * @arg textVariable
 * @text 텍스트 변수
 * @desc 이 변수에서 텍스트를 가져옵니다. 0이면 사용 안 함.
 * @type variable
 * @default 0
 *
 * @command sendEvent
 * @text 이벤트 보내기
 * @desc 다른 플레이어에게 사용자 이벤트를 값과 함께 보냅니다.
 *
 * @arg name
 * @text 이벤트 이름
 * @desc boss, trade 등 자유로운 이름.
 * @type string
 * @default 
 *
 * @arg valueVariable
 * @text 값 변수
 * @desc 보낼 변수(이벤트 보내기) 또는 받은 값을 넣을 변수(이벤트 수신 시). 0이면 사용 안 함.
 * @type variable
 * @default 0
 *
 * @command onEvent
 * @text 이벤트 수신 시
 * @desc 다른 플레이어가 이 이벤트를 보내면: 값을 변수에 넣고, 보낸 사람 이름을 넣고, 커먼 이벤트를 실행합니다. 시작할 때 자동 실행이나 병렬 처리 이벤트에서 한 번만 실행하세요.
 *
 * @arg name
 * @text 이벤트 이름
 * @desc boss, trade 등 자유로운 이름.
 * @type string
 * @default 
 *
 * @arg valueVariable
 * @text 값 변수
 * @desc 보낼 변수(이벤트 보내기) 또는 받은 값을 넣을 변수(이벤트 수신 시). 0이면 사용 안 함.
 * @type variable
 * @default 0
 *
 * @arg senderVariable
 * @text 보낸 사람 이름 변수
 * @desc 보낸 사람 이름을 넣을 변수. 0이면 사용 안 함.
 * @type variable
 * @default 0
 *
 * @arg commonEvent
 * @text 커먼 이벤트
 * @desc 실행할 커먼 이벤트. 0이면 사용 안 함.
 * @type common_event
 * @default 0
 */
