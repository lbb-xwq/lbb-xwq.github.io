/**
 * 全站内容数据 —— 唯一内容源。
 * 个人信息来自刘兵兵本人的简历（姓名/联系方式/技能/工作经历/教育），
 * 按本人要求：
 *   1) 工作年限按 10 年表述；
 *   2) **不出现任何项目经历**（“项目墙”改成 6 个「负责项目」卡，不含真实项目/品牌名）；
 *   3) 其余按简历内容生成。
 */

export const meta = {
  title: '刘兵兵 — 体验组前端开发人员',
  description:
    '刘兵兵，10 年前端开发经验，现为体验组前端开发人员。熟悉 Vue / React 生态与工程化建设，做过中后台系统、数据可视化大屏、复杂表格表单组件与微前端集成。',
  siteName: 'liubingbing.dev',
  copyright: '2026 刘兵兵',
};

export const person = {
  name: '刘兵兵',
  latin: 'LIU BINGBING',
  role: '体验组前端开发人员',
  roleEn: '体验组前端开发人员',
  email: 'bingbing.liu@rootglobal.net',
  phone: '13697004800',
  city: '深圳',
  timezone: 'Asia/Shanghai',
  timezoneLabel: 'Shenzhen / UTC+8',
  /** 照片：把竖图/方图放到 public/images/portrait.png 后改这里 */
  portrait: '/images/portrait.png',
  portraitSpec: '1254 × 1254',
  /** 只保留邮箱与电话：本人要求不展示 GitHub / 掘金 */
  socials: [
    { label: '邮箱', href: 'mailto:bingbing.liu@rootglobal.net' },
    { label: '电话', href: 'tel:13697004800' },
  ],
};

export const nav = [
  { id: 'home', label: '首页', zh: '01', href: '/' },
  { id: 'about', label: '关于', zh: '02', href: '/about' },
  { id: 'projects', label: '负责项目', zh: '03', href: '/projects' },
  { id: 'contact', label: '联系', zh: '04', href: '/contact' },
];

export const hero = {
  /** 巨型两行标题（参考站排版签名：CREATIVE / DEVELOPER） */
  titleLines: ['前端开发', '工程师'],
  ariaLabel: '前端开发工程师',
  infoTag: '[ 信息日志 ]',
  infoLines: ['十年时间把界面做稳：中后台系统、数据可视化、', '组件体系与工程化，从 0 到 1 能独立落地。'],
  mobileStats: [
    { value: '10 年', label: '年限' },
    { value: '12+', label: '技术栈' },
  ],
  /** HUD 两条指标：不展示项目数量，改用技术栈与年限 */
  stats: [
    { label: '技术栈', value: ' 12+' },
    { label: '工作年限', value: ' 10+' },
  ],
  terminalLines: [
    '> 技术栈: VUE / REACT / ECHARTS',
    '> 系统性能: [HIGH]',
  ],
  /** 右上跑马灯（单行）：标签 / 值 对 */
  marquee: [
    { tech: '核心', label: 'VUE 3 · REACT · TYPESCRIPT' },
    { tech: '样式', label: 'SASS · LESS · UNOCSS · 响应式' },
    { tech: '可视化', label: 'ECHARTS · ECHARTS-GL · OPENLAYERS' },
    { tech: '构建', label: 'VITE · WEBPACK · 打包优化' },
    { tech: '团队', label: '体验组 · 前端开发' },
    { tech: '坐标', label: '深圳 · 中国' },
  ],
  helloLabel: '联系方式',
  localTimeLabel: '本地时间',
};
export const about = {
  title: '关于刘兵兵',
  breadcrumb: ['首页', '关于'],
  lead: ['10 年', '前端开发'],
  leadBig: ['把复杂界面', '做成能长期维护的系统'],
  lede: '十年里一直在做企业级前端：中后台系统、数据可视化大屏、组件体系与工程化建设。习惯从 0 到 1 搭架构，也习惯回头把老项目的构建和性能问题一个个收拾干净。',
  /** 40 帧图序列（程序化生成，无外部素材） */
  frames: { total: 40, width: 402, height: 600 },
  sectors: [
    {
      id: '01',
      name: 'Vue 生态',
      zh: 'Vue 生态',
      body: '用 Vue 3 + TypeScript 做中后台系统：动态路由实现不同权限的校验与菜单匹配，Pinia 管全局状态并持久化，Element-Plus 做业务组件。',
      tags: ['Vue 3', 'TypeScript', 'Pinia', 'Vue Router', 'Element-Plus'],
    },
    {
      id: '02',
      name: 'React 生态',
      zh: 'React 生态',
      body: 'React 单页应用开发，用 redux / react-thunk / redux-actions 处理状态，用 HOC 抽离可复用的组件逻辑。',
      tags: ['React', 'Redux', 'HOC', 'Ant Design', 'React-Bootstrap'],
    },
    {
      id: '03',
      name: '数据可视化',
      zh: '数据可视化',
      body: 'ECharts 与 ECharts-GL 组合出 2D/3D 图表，通过缩放方案统一大屏自适应；地图与告警类模块用 OpenLayers + GeoServer 对接设备数据。',
      tags: ['ECharts', 'ECharts-GL', 'OpenLayers', 'GeoServer', '大屏自适应'],
    },
    {
      id: '04',
      name: '工程化与构建',
      zh: '工程化与构建',
      body: '能从 0 到 1 独立搭建项目架构；Vite / webpack / vue-cli 全流程都熟，做过 webpack 3 升 4、按路由代码分包、依赖与体积治理。',
      tags: ['Vite', 'Webpack', '代码分包', '打包提速', '0-1 架构'],
    },
    {
      id: '05',
      name: '组件与复用',
      zh: '组件与复用',
      body: '表格与表单的二次封装、用 hooks 抽离列表页通用逻辑、用自定义指令解决大数据量下拉卡顿，让同类页面能快速开发。',
      tags: ['表格/表单二次封装', 'Hooks', '自定义指令', 'Element-UI', 'Vant'],
    },
    {
      id: '06',
      name: '微前端与集成',
      zh: '微前端与集成',
      body: '按子系统成熟度选择 micro-app 或 iframe 两种方式内嵌其他项目，统一登录态（OAuth）与消息通道，支持模块独立部署与集成。',
      tags: ['micro-app', 'iframe', 'OAuth', '独立部署'],
    },
    {
      id: '07',
      name: '工作经历',
      zh: '工作经历',
      body: '十年间在三家公司做前端开发，从页面与交互实现，到系统架构、组件体系与工程化建设，职责逐步扩展到独立负责子系统。',
      tags: [
        '2022.04–2024.07 富士康工业互联网股份有限公司 · 前端开发工程师',
        '2019.04–2022.03 中国深圳外轮代理股份有限公司 · 前端开发工程师',
        '2017.07–2019.03 深圳市中创优网络科技有限公司 · 前端开发工程师',
      ],
    },
    {
      id: '08',
      name: '教育经历',
      zh: '教育经历',
      body: '本科 · 电子商务 · 2013–2017。在校期间获国家励志奖学金与多次三好学生称号，并参与志愿者协会与公益活动。',
      tags: ['江西科技师范大学 · 本科', '电子商务 · 2013–2017'],
    },
  ],
  outro: {
    big: ['关于前端与工程化', '欢迎随时交流'],
    cta: '联系我',
  },
};

export type Project = {
  slug: string;
  order: string;
  name: string;
  type: string;
  role: string;
  year: string;
  description: string;
  overview: string;
  stack: string[];
  /** 线上地址：有值则卡片与详情页直接跳外链 */
  href?: string;
  /** 程序化占位配色（无版权风险）：卡面用渐变 + 网格生成 */
  palette: [string, string];
  showcase: { ref: string; caption: string }[];
};

/**
 * 负责项目（**不是真实项目经历**）。
 * 按本人要求：站点不展示任何真实项目/品牌/客户信息，
 * 这里只描述「能力与做法」，卡面与详情页全部是程序化生成画面。
 */
export const projects: Project[] = [
  {
    slug: 'crm',
    order: '01',
    name: 'CRM 客户管理系统',
    type: '运营后台',
    role: '前端负责',
    year: '2024 – 至今',
    description: '面向运营的客户管理与工单后台，含权限、看板与批量操作。',
    overview: '负责前端整体：权限路由与菜单、请求层与错误处理、配置式表格与表单封装、看板图表与批量操作。线上地址 station-admin.cozyprogram.com。',
    stack: ['Vue 3', 'TypeScript', 'Element-Plus', 'ECharts', 'Vite'],
    href: 'https://station-admin.cozyprogram.com/',
    palette: ['#0d1b2a', '#1b4965'],
    showcase: [
      { ref: '线上地址 station-admin.cozyprogram.com', caption: 'CRM 运营后台' },
      { ref: '权限与菜单', caption: '权限路由与菜单' },
    ],
  },
  {
    slug: 'account-center',
    order: '02',
    name: '用户中心',
    type: '账号与会员',
    role: '前端负责',
    year: '2024 – 至今',
    description: '品牌会员的账号体系：注册登录、会员权益、订单与设备管理。',
    overview: '负责账号相关页面：登录注册与第三方授权、多语言与多地区适配、会员权益与订单/设备信息展示。线上地址 account.momcozy.com。',
    stack: ['Vue 3', 'TypeScript', 'i18n', '响应式', 'Vite'],
    href: 'https://account.momcozy.com/',
    palette: ['#2b1a3d', '#6d3f8f'],
    showcase: [
      { ref: '线上地址 account.momcozy.com', caption: '用户中心' },
      { ref: '会员权益与订单', caption: '会员与订单' },
    ],
  },
  {
    slug: 'official-site',
    order: '03',
    name: '品牌独立站',
    type: '品牌官网',
    role: '前端开发',
    year: '2024 – 至今',
    description: '面向海外的品牌独立站，页面搭建、动效与性能优化。',
    overview: '负责官网页面与组件开发：内容区块搭建、响应式与多端适配、图片与脚本加载优化，保证移动端体验与首屏速度。线上地址 momcozy.com。',
    stack: ['Vue 3', '响应式', 'SSR 页面', '性能优化', 'CDN'],
    href: 'https://momcozy.com/',
    palette: ['#0b2b26', '#2f6b5f'],
    showcase: [
      { ref: '线上地址 momcozy.com', caption: '品牌独立站' },
      { ref: '移动端适配', caption: '移动端页面' },
    ],
  },
];
export const notFound = {
  code: '404',
  title: '这条路走不通',
  body: '你要找的页面不存在，或者已经被移动到别处了。',
  cta: '回到首页',
};

export const contact = {
  capsule: '想聊聊前端、工程化，或者任何技术问题？',
  replyNote: '邮件通常一天内回复。',
};