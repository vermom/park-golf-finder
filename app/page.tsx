'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Car,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Heart,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Navigation,
  Phone,
  RotateCcw,
  Save,
  Search,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Trophy,
  UserRound,
  Users,
} from 'lucide-react';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ELIGIBILITY_OPTIONS,
  REGISTRATION_STATUSES,
  computeStatus,
  conflictsFor,
  filterEvents,
  isHomeRegion,
  sortEvents,
  type EventFilters,
  type EventItem,
  type RegistrationStatus,
} from '@/lib/events';
import { brouterUrl, formatDrivingRoute, parseBrouterRoute, type DrivingRoute } from '@/lib/distance';
import {
  EMPTY_PROFILE,
  PROFILE_REGIONS,
  hasProfile,
  normalizeProfile,
  profileSummary,
  type LocalProfile,
  type MembershipStatus,
} from '@/lib/profile';
import {
  buildChromeIntentUrl,
  canUseNativeInstallPrompt,
  detectInstallBrowser,
  resolveInstallDialogMode,
  type InstallBrowser,
} from '@/lib/pwa-install';

type SourceStatus = {
  id: string;
  name: string;
  status: 'success' | 'failed' | 'manual_required';
  last_checked_at: string;
  message: string;
  url: string;
};

type EventFile = {
  meta: {
    generated_at: string;
    timezone: string;
    event_count: number;
    source_statuses: SourceStatus[];
  };
  events: EventItem[];
};

type SavedState = { favorites: string[]; applied: string[]; profile: LocalProfile };
type ViewMode = 'all' | 'favorites' | 'applied';
type UserLocation = { latitude: number; longitude: number };
type RouteState =
  | { status: 'loading' }
  | { status: 'ready'; route: DrivingRoute }
  | { status: 'error'; message: string };
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

declare global {
  interface Document {
    modelContext?: {
      registerTool: (
        tool: {
          name: string;
          title: string;
          description: string;
          inputSchema: object;
          annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
          execute: (input: unknown) => unknown;
        },
        options?: { signal?: AbortSignal },
      ) => void | Promise<void>;
    };
  }
}

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const dataUrl = `${basePath}/data/events.json`;
const STORAGE_KEY = 'park-golf-finder:v1';
const INSTALL_GUIDE_SESSION_KEY = 'park-golf-finder:install-guide-shown';

const emptyFilters: EventFilters = {
  query: '',
  region: '',
  dateStart: '',
  dateEnd: '',
  status: '',
  eligibility: '',
  competitionType: '',
  nearbyOnly: false,
};

const statusStyle: Record<RegistrationStatus, string> = {
  '접수 예정': 'bg-sky-100 text-sky-900 border-sky-200',
  '접수 중': 'bg-emerald-600 text-white border-emerald-600',
  '마감 임박': 'bg-orange-500 text-white border-orange-500',
  '접수 마감': 'bg-slate-200 text-slate-800 border-slate-300',
  '대회 종료': 'bg-slate-700 text-white border-slate-700',
};

function formatDate(value: string | null, withTime = false) {
  if (!value) return '확인 필요';
  const date = value.length === 10 ? new Date(`${value}T12:00:00+09:00`) : new Date(value);
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: withTime ? undefined : 'short',
    hour: withTime ? '2-digit' : undefined,
    minute: withTime ? '2-digit' : undefined,
    timeZone: 'Asia/Seoul',
  }).format(date);
}

function formatPeriod(start: string, end: string) {
  return start === end ? formatDate(start) : `${formatDate(start)} ~ ${formatDate(end)}`;
}

function formatDateList(values: string[]) {
  return values.length ? values.map((value) => formatDate(value)).join(', ') : '별도 일정 없음 또는 확인 필요';
}

function display(value: string | null | undefined) {
  return value?.trim() || '확인 필요';
}

function telephoneHref(value: string) {
  const firstNumber = value.match(/\+?\d{2,4}-\d{3,4}-\d{4}/)?.[0] ?? value;
  return `tel:${firstNumber.replace(/[^0-9+]/g, '')}`;
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <Select value={value || 'all'} onValueChange={(next) => onChange(next === 'all' || next === null ? '' : String(next))}>
        <SelectTrigger aria-label={label} className="h-12 w-full rounded-xl border-slate-300 bg-white px-3 text-base">
          <SelectValue>{value || `${label} 전체`}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{label} 전체</SelectItem>
          {options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function NativeDialog({
  open,
  onClose,
  labelledBy,
  describedBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  describedBy: string;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="native-dialog"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClose={onClose}
    >
      {children}
    </dialog>
  );
}

export default function Home() {
  const [data, setData] = useState<EventFile | null>(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<EventFilters>(emptyFilters);
  const [sort, setSort] = useState<'event' | 'registration'>('event');
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [profile, setProfile] = useState<LocalProfile>(EMPTY_PROFILE);
  const [profileDraft, setProfileDraft] = useState<LocalProfile>(EMPTY_PROFILE);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [storageReady, setStorageReady] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'ready' | 'error'>('idle');
  const [locationMessage, setLocationMessage] = useState('');
  const [routes, setRoutes] = useState<Record<string, RouteState>>({});
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [installBrowser, setInstallBrowser] = useState<InstallBrowser>('other');
  const [chromeOpenUrl, setChromeOpenUrl] = useState('');
  const [isInstallContinuation, setIsInstallContinuation] = useState(false);
  const [installPromptWaitExpired, setInstallPromptWaitExpired] = useState(false);
  const requestedRouteKeys = useRef(new Set<string>());

  /* oxlint-disable react/react-compiler -- 브라우저 저장값과 외부 JSON을 최초 1회 동기화합니다. */
  useEffect(() => {
    fetch(dataUrl, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('대회 자료를 불러오지 못했습니다.');
        return response.json() as Promise<EventFile>;
      })
      .then(setData)
      .catch(() => setError('대회 자료를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 열어 주세요.'));

    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<SavedState>;
      setFavorites(new Set(saved.favorites ?? []));
      setApplied(new Set(saved.applied ?? []));
      setProfile(normalizeProfile(saved.profile));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setStorageReady(true);
    }
  }, []);
  /* oxlint-enable react/react-compiler */

  useEffect(() => {
    if (!storageReady) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ favorites: [...favorites], applied: [...applied], profile }));
  }, [favorites, applied, profile, storageReady]);

  useEffect(() => {
    let installGuideTimer: number | undefined;
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register(`${basePath}/sw.js`, { scope: `${basePath}/` })
        .then((registration) => registration.update())
        .catch(() => undefined);
    }

    const readDeviceState = () => {
      const standalone = window.matchMedia('(display-mode: standalone)').matches
        || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      const browser = detectInstallBrowser(navigator.userAgent, navigator.maxTouchPoints);
      const mobile = browser !== 'other';
      const installContinuation = new URLSearchParams(window.location.search).get('install') === '1';
      setIsInstalled(standalone);
      setInstallBrowser(browser);
      setChromeOpenUrl(browser === 'samsung' ? (buildChromeIntentUrl(window.location.href) ?? '') : '');
      setIsInstallContinuation(installContinuation);
      if (standalone || !mobile) return;
      try {
        if (!installContinuation && sessionStorage.getItem(INSTALL_GUIDE_SESSION_KEY)) return;
        sessionStorage.setItem(INSTALL_GUIDE_SESSION_KEY, '1');
      } catch {
        // 저장 기능이 막힌 브라우저에서도 설치 안내는 한 번 표시합니다.
      }
      if (installContinuation) {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('install');
        window.history.replaceState(null, '', cleanUrl);
      }
      installGuideTimer = window.setTimeout(() => setInstallHelpOpen(true), 900);
    };
    if (document.readyState === 'complete') queueMicrotask(readDeviceState);
    else window.addEventListener('load', readDeviceState, { once: true });

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      const browser = detectInstallBrowser(navigator.userAgent, navigator.maxTouchPoints);
      if (!canUseNativeInstallPrompt(browser)) {
        setInstallPrompt(null);
        return;
      }
      setInstallPromptWaitExpired(false);
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      setInstallHelpOpen(false);
    };
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      if (installGuideTimer) window.clearTimeout(installGuideTimer);
      window.removeEventListener('load', readDeviceState);
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  useEffect(() => {
    if (!installHelpOpen || installBrowser !== 'android' || !isInstallContinuation || installPrompt) return;
    const timer = window.setTimeout(() => setInstallPromptWaitExpired(true), 1800);
    return () => window.clearTimeout(timer);
  }, [installBrowser, installHelpOpen, installPrompt, isInstallContinuation]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool || !data) return;
    const lifecycle = new AbortController();
    const updateSavedState = (kind: 'favorite' | 'applied', input: unknown) => {
      const eventId = typeof input === 'object' && input && 'eventId' in input ? String(input.eventId) : '';
      const event = data.events.find((item) => item.id === eventId);
      if (!event) throw new Error('존재하지 않는 대회입니다.');
      const setter = kind === 'favorite' ? setFavorites : setApplied;
      setter((current) => {
        const next = new Set(current);
        if (next.has(eventId)) next.delete(eventId);
        else next.add(eventId);
        return next;
      });
      return { eventId, eventName: event.name, changed: kind };
    };
    const register = (kind: 'favorite' | 'applied') => context.registerTool(
      {
        name: kind === 'favorite' ? 'toggle_event_favorite' : 'toggle_event_applied',
        title: kind === 'favorite' ? '관심 대회 저장 전환' : '신청 완료 전환',
        description: kind === 'favorite' ? '대회를 관심 목록에 저장하거나 해제합니다.' : '대회의 신청 완료 상태를 표시하거나 해제합니다.',
        inputSchema: {
          type: 'object',
          properties: { eventId: { type: 'string', description: '대회 ID' } },
          required: ['eventId'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: (input) => updateSavedState(kind, input),
      },
      { signal: lifecycle.signal },
    );
    try {
      void Promise.all([Promise.resolve(register('favorite')), Promise.resolve(register('applied'))]).catch(() => undefined);
    } catch {
      // WebMCP 미지원 브라우저에서는 화면 기능만 사용합니다.
    }
    return () => lifecycle.abort();
  }, [data]);

  const allEvents = useMemo(() => data?.events ?? [], [data]);
  const regions = useMemo(() => [...new Set(allEvents.map((event) => event.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')), [allEvents]);
  const conflicts = useMemo(() => conflictsFor(allEvents, applied), [allEvents, applied]);
  const shownEvents = useMemo(() => {
    const filtered = filterEvents(allEvents, filters, new Date(), profile.region).filter((event) => {
      if (viewMode === 'favorites') return favorites.has(event.id);
      if (viewMode === 'applied') return applied.has(event.id);
      return true;
    });
    return sortEvents(filtered, sort, profile.region);
  }, [allEvents, filters, sort, viewMode, favorites, applied, profile.region]);

  const openCount = allEvents.filter((event) => ['접수 중', '마감 임박'].includes(computeStatus(event))).length;
  const failedSources = data?.meta.source_statuses.filter((source) => source.status === 'failed').length ?? 0;
  const installDialogMode = resolveInstallDialogMode(
    installBrowser,
    Boolean(installPrompt),
    isInstallContinuation,
    installPromptWaitExpired,
  );

  useEffect(() => {
    if (!userLocation) return;
    const destinations = new Map<string, NonNullable<EventItem['venue_location']>>();
    for (const event of shownEvents) {
      const destination = event.venue_location;
      if (!destination) continue;
      const key = `${destination.latitude},${destination.longitude}`;
      if (!requestedRouteKeys.current.has(key)) destinations.set(key, destination);
    }
    if (!destinations.size) return;

    const queue = [...destinations.entries()];
    for (const [key] of queue) requestedRouteKeys.current.add(key);

    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const [key, destination] = queue[cursor++];
        try {
          const response = await fetch(brouterUrl(userLocation, destination));
          if (!response.ok) throw new Error('경로 서비스 응답 오류');
          const route = parseBrouterRoute(await response.json());
          setRoutes((current) => ({ ...current, [key]: { status: 'ready', route } }));
        } catch {
          setRoutes((current) => ({
            ...current,
            [key]: { status: 'error', message: '지금은 거리를 계산할 수 없어요. 길찾기로 확인해 주세요.' },
          }));
        }
      }
    };
    void Promise.all([worker(), worker()]);
  }, [shownEvents, userLocation]);

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openProfileEditor = () => {
    setProfileDraft({ ...profile });
    setProfileError('');
    setProfileOpen(true);
  };

  const saveProfile = () => {
    const next = normalizeProfile(profileDraft);
    if (!next.region) {
      setProfileError('주로 활동하는 시·도를 선택해 주세요.');
      return;
    }
    setProfile(next);
    setProfileError('');
    setProfileOpen(false);
  };

  const deleteProfile = () => {
    if (!window.confirm('이 기기에 저장된 내 정보만 삭제할까요? 관심 대회와 신청 완료 표시는 그대로 남습니다.')) return;
    setProfile(EMPTY_PROFILE);
    setProfileDraft(EMPTY_PROFILE);
    setFilters((current) => ({ ...current, nearbyOnly: false }));
    setProfileOpen(false);
  };

  const startInstall = async () => {
    if (isInstalled) return;
    if (installBrowser === 'samsung') {
      setInstallHelpOpen(true);
      return;
    }
    if (!installPrompt) {
      setInstallHelpOpen(true);
      return;
    }
    setInstallHelpOpen(false);
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setIsInstalled(true);
    setInstallPrompt(null);
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('error');
      setLocationMessage('이 브라우저에서는 위치 확인을 지원하지 않아요.');
      return;
    }
    setLocationStatus('requesting');
    setLocationMessage('현재 위치를 확인하고 있어요…');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        requestedRouteKeys.current.clear();
        setRoutes({});
        setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocationStatus('ready');
        setLocationMessage('현재 위치를 확인했어요. 자동차 거리와 예상 시간을 계산합니다.');
      },
      (positionError) => {
        setLocationStatus('error');
        setLocationMessage(positionError.code === positionError.PERMISSION_DENIED
          ? '위치 권한이 꺼져 있어요. 주소창의 자물쇠 버튼에서 위치를 허용해 주세요.'
          : '현재 위치를 확인하지 못했어요. 잠시 후 다시 눌러 주세요.');
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 300_000 },
    );
  };

  return (
    <>
      <NativeDialog open={profileOpen} onClose={() => setProfileOpen(false)} labelledBy="profile-dialog-title" describedBy="profile-dialog-description">
        <div className="grid max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto p-5 text-base sm:p-6">
          <div className="flex flex-col gap-2">
            <h2 id="profile-dialog-title" className="pr-8 text-2xl font-black text-slate-950">내 정보 등록</h2>
            <p id="profile-dialog-description" className="text-base leading-7 text-slate-600">
              참가 조건을 확인할 때 참고할 정보입니다. 이 기기의 브라우저에만 저장되고 접수처로 자동 전송되지 않습니다.
            </p>
          </div>

          <div className="grid gap-4 py-1">
            <div className="grid gap-1.5">
              <label htmlFor="profile-region" className="text-base font-black text-slate-800">주로 활동하는 시·도 <span className="text-rose-700">필수</span></label>
              <select
                id="profile-region"
                className="profile-select"
                value={profileDraft.region}
                onChange={(event) => setProfileDraft({ ...profileDraft, region: event.target.value })}
              >
                <option value="">시·도를 선택하세요</option>
                {PROFILE_REGIONS.map((region) => <option key={region} value={region}>{region}</option>)}
              </select>
            </div>

            <label htmlFor="profile-city" className="grid gap-1.5 text-base font-black text-slate-800">
              거주 시·군·구 <span className="font-normal text-slate-500">선택</span>
              <Input id="profile-city" maxLength={40} className="h-13 rounded-xl bg-white text-base md:text-base" value={profileDraft.city} onChange={(event) => setProfileDraft({ ...profileDraft, city: event.target.value })} placeholder="예: 경주시" />
            </label>

            <label htmlFor="profile-club" className="grid gap-1.5 text-base font-black text-slate-800">
              소속 클럽 <span className="font-normal text-slate-500">선택</span>
              <Input id="profile-club" maxLength={40} className="h-13 rounded-xl bg-white text-base md:text-base" value={profileDraft.club} onChange={(event) => setProfileDraft({ ...profileDraft, club: event.target.value })} placeholder="예: 한마음클럽" />
            </label>

            <div className="grid gap-1.5">
              <label htmlFor="profile-membership" className="text-base font-black text-slate-800">대한파크골프협회 회원 여부 <span className="font-normal text-slate-500">선택</span></label>
              <select
                id="profile-membership"
                className="profile-select"
                value={profileDraft.membership}
                onChange={(event) => {
                  const membership = event.target.value as MembershipStatus;
                  setProfileDraft({
                    ...profileDraft,
                    membership,
                    membershipNumber: membership === 'member' ? profileDraft.membershipNumber : '',
                  });
                }}
              >
                <option value="">선택하지 않음</option>
                <option value="member">회원</option>
                <option value="not-member">비회원</option>
                <option value="unknown">잘 모르겠어요</option>
              </select>
            </div>

            {profileDraft.membership === 'member' && (
              <label htmlFor="profile-membership-number" className="grid gap-1.5 text-base font-black text-slate-800">
                대한파크골프협회 회원번호 <span className="font-normal text-slate-500">선택</span>
                <Input
                  id="profile-membership-number"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={30}
                  className="h-13 rounded-xl bg-white text-base md:text-base"
                  value={profileDraft.membershipNumber}
                  onChange={(event) => setProfileDraft({ ...profileDraft, membershipNumber: event.target.value })}
                  placeholder="예: 1234-5678"
                  aria-describedby="membership-number-help"
                />
                <span id="membership-number-help" className="text-sm font-normal leading-6 text-slate-500">접수할 때 확인하기 위한 메모이며 이 기기에만 저장됩니다.</span>
              </label>
            )}

            <div className="flex gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-base leading-7 text-sky-950">
              <ShieldCheck className="mt-1 size-6 shrink-0" aria-hidden="true" />
              <p><strong>회원번호를 포함한 내 정보는 외부로 전송되지 않아요.</strong><br />브라우저 저장값은 암호화되지 않으므로 공용 기기에서는 저장하지 마세요.</p>
            </div>
            {profileError && <p role="alert" className="font-bold text-rose-700">{profileError}</p>}
          </div>

          <div className="-mx-5 -mb-5 grid grid-cols-2 gap-2 rounded-b-3xl border-t bg-slate-50 p-4 sm:-mx-6 sm:-mb-6 sm:grid-cols-[auto_1fr_1fr]">
            <Button type="button" variant="destructive" size="lg" className="h-12 text-base font-black" disabled={!hasProfile(profile)} onClick={deleteProfile}>
              <Trash2 aria-hidden="true" /> 삭제
            </Button>
            <Button type="button" variant="outline" size="lg" className="h-12 text-base font-black" onClick={() => setProfileOpen(false)}>취소</Button>
            <Button type="button" size="lg" className="col-span-2 h-12 text-base font-black sm:col-span-1" onClick={saveProfile}>
              <Save aria-hidden="true" /> 저장
            </Button>
          </div>
        </div>
      </NativeDialog>

      <NativeDialog open={installHelpOpen} onClose={() => setInstallHelpOpen(false)} labelledBy="install-dialog-title" describedBy="install-dialog-description">
        <div className="grid gap-4 p-5 text-base sm:p-6">
          <div className="flex flex-col gap-2">
            <span className={`mb-1 grid size-14 place-items-center rounded-2xl text-white ${installBrowser === 'samsung' ? 'bg-amber-600' : 'bg-emerald-700'}`}>
              {installBrowser === 'samsung' ? <ShieldCheck className="size-7" aria-hidden="true" /> : <Smartphone className="size-7" aria-hidden="true" />}
            </span>
            <h2 id="install-dialog-title" className="text-2xl font-black text-slate-950">
              {installBrowser === 'samsung' ? '휴대폰 홈 화면에 설치하기' : '휴대폰에 앱 설치하기'}
            </h2>
            <p id="install-dialog-description" className="text-base leading-7 text-slate-600">
              {installBrowser === 'samsung' ? 'Chrome은 설치할 때 한 번만 열고, 설치 후에는 홈 화면 아이콘으로 바로 실행해요.' : '설치비 없이 홈 화면에서 앱처럼 바로 열 수 있어요.'}
            </p>
          </div>
          {installDialogMode === 'samsung' ? (
            <div className="grid gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
              <ol className="install-steps">
                <li><span>1</span><div>아래의 <strong>Chrome에서 설치 계속</strong>을 누르세요.</div></li>
                <li><span>2</span><div>Chrome에서 <strong>휴대폰에 앱 설치</strong>를 누르세요.</div></li>
                <li><span>3</span><div>설치가 끝나면 홈 화면의 <strong>파크골프 대회</strong> 아이콘을 누르세요.</div></li>
              </ol>
              {chromeOpenUrl && (
                <a href={chromeOpenUrl} className={buttonVariants({ size: 'lg', className: 'h-16 w-full text-xl font-black' })}>
                  <ExternalLink className="size-6" aria-hidden="true" /> Chrome에서 설치 계속
                </a>
              )}
              <p className="rounded-xl bg-white p-3 text-base font-bold leading-7 text-emerald-950">설치 후에는 Chrome에 다시 들어갈 필요가 없어요. 일반 앱처럼 홈 화면 아이콘만 누르면 됩니다.</p>
              <p className="text-sm font-semibold leading-6 text-slate-600">이전에 보인 보안 경고에서는 ‘무시하고 설치하기’를 누르지 말고 ‘확인’으로 닫아 주세요.</p>
            </div>
          ) : installDialogMode === 'prompt' ? (
            <div className="grid gap-3 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 text-center">
              <p className="text-lg font-black leading-8 text-emerald-950">
                {isInstallContinuation ? '이제 마지막 단계예요.' : '아래 버튼을 누르세요.'}<br />다음 화면에서 ‘설치’만 누르면 됩니다.
              </p>
              <Button type="button" size="lg" className="h-16 w-full text-xl font-black" onClick={() => void startInstall()}>
                <Download className="size-6" aria-hidden="true" /> 휴대폰에 앱 설치
              </Button>
              <p className="text-base font-bold leading-7 text-emerald-950">설치 후에는 홈 화면의 ‘파크골프 대회’ 아이콘으로 바로 실행됩니다.</p>
            </div>
          ) : installDialogMode === 'checking' ? (
            <div className="grid min-h-40 place-items-center gap-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-5 text-center" aria-live="polite">
              <LoaderCircle className="size-9 animate-spin text-emerald-700" aria-hidden="true" />
              <p className="text-lg font-black text-emerald-950">설치 상태를 확인하고 있어요…</p>
            </div>
          ) : installDialogMode === 'installed-help' ? (
            <div className="grid gap-4 rounded-2xl border-2 border-sky-300 bg-sky-50 p-4">
              <div>
                <h3 className="text-xl font-black leading-8 text-sky-950">이미 설치되어 있을 가능성이 커요</h3>
                <p className="mt-1 leading-7 text-slate-700">Chrome은 같은 앱이 설치되어 있으면 중복 설치 버튼을 보여주지 않습니다.</p>
              </div>
              <ol className="install-steps">
                <li><span>1</span><div>Chrome을 닫고 <strong>휴대폰 홈 화면</strong>으로 가세요.</div></li>
                <li><span>2</span><div>홈 화면을 <strong>아래에서 위로</strong> 밀어 앱스 화면을 여세요.</div></li>
                <li><span>3</span><div><strong>파크골프 대회</strong>를 찾아 아이콘을 길게 누르세요.</div></li>
                <li><span>4</span><div><strong>홈 화면에 추가</strong>를 누르세요.</div></li>
              </ol>
              <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 font-bold leading-7 text-amber-950">앱스 화면에도 없다면: 휴대폰 <strong>설정 → 애플리케이션 → 파크골프 대회 → 삭제</strong> 후 홈페이지에서 다시 설치하세요.</p>
            </div>
          ) : installDialogMode === 'ios' ? (
            <ol className="install-steps">
              <li><span>1</span><div><strong><Share2 className="inline size-6" aria-hidden="true" /> 공유</strong> 버튼을 누르세요.</div></li>
              <li><span>2</span><div><strong>홈 화면에 추가</strong>를 누르세요.</div></li>
              <li><span>3</span><div>오른쪽 위의 <strong>추가</strong>를 누르세요.</div></li>
            </ol>
          ) : (
            <ol className="install-steps">
              <li><span>1</span><div>브라우저 오른쪽 위의 <strong>점 3개</strong>를 누르세요.</div></li>
              <li><span>2</span><div><strong>앱 설치</strong> 또는 <strong>홈 화면에 추가</strong>를 누르세요.</div></li>
              <li><span>3</span><div><strong>설치</strong>를 누르세요.</div></li>
            </ol>
          )}
          {installDialogMode === 'manual' && <p className="rounded-xl bg-amber-50 p-3 font-bold leading-7 text-amber-950">카카오톡 안에서 열었다면 먼저 점 3개 메뉴에서 ‘다른 브라우저로 열기’를 눌러주세요.</p>}
          <div className="-mx-5 -mb-5 rounded-b-3xl border-t bg-slate-50 p-4 sm:-mx-6 sm:-mb-6">
            <Button type="button" variant="outline" size="lg" className="h-14 w-full text-lg font-black" onClick={() => setInstallHelpOpen(false)}>
              {installBrowser === 'samsung' ? '취소' : '나중에 하기'}
            </Button>
          </div>
        </div>
      </NativeDialog>

      <main className="min-h-screen bg-background text-foreground">
      <header className="scoreboard-band">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
          <div>
            <p className="eyebrow">전국 대회 일정과 접수 정보</p>
            <h1 className="text-2xl font-black tracking-[-0.035em] sm:text-4xl">파크골프 대회 찾기</h1>
            <p className="mt-1 text-sm font-semibold text-emerald-50 sm:text-base">공식 공고를 모아 보기 쉽게 정리했어요.</p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
            <Button variant="outline" size="lg" className="h-12 border-white/70 bg-white px-4 text-base font-black text-emerald-900 hover:bg-emerald-50" onClick={openProfileEditor}>
              <UserRound aria-hidden="true" /> {hasProfile(profile) ? '내 정보 수정' : '내 정보 등록'}
            </Button>
            <Button variant="outline" size="lg" className="h-12 border-white/70 bg-emerald-950/35 px-4 text-base font-black text-white hover:bg-emerald-950/55 hover:text-white" onClick={() => void startInstall()} disabled={isInstalled}>
              {isInstalled ? <CheckCircle2 aria-hidden="true" /> : <Download aria-hidden="true" />} {isInstalled ? '앱 설치됨' : '홈 화면에 설치'}
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-5 sm:px-6">
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="summary-tile summary-primary"><span>접수 가능</span><strong>{data ? `${openCount}개` : '—'}</strong></div>
          <div className="summary-tile"><span>관심 대회</span><strong>{favorites.size}개</strong></div>
          <div className="summary-tile col-span-2 sm:col-span-1"><span>신청 완료</span><strong>{applied.size}개</strong></div>
        </div>

        <section className="profile-panel mb-4" aria-labelledby="profile-heading">
          <div className="flex min-w-0 items-start gap-3">
            <span className="profile-icon" aria-hidden="true"><ShieldCheck /></span>
            <div className="min-w-0">
              <h2 id="profile-heading" className="text-lg font-black text-emerald-950">내 정보는 이 기기에만 저장돼요</h2>
              <p className="text-base text-slate-700">
                {hasProfile(profile) ? profileSummary(profile) : '활동 지역과 협회 회원 여부를 등록하면 내 지역 대회를 먼저 볼 수 있어요.'}
              </p>
              <p className="mt-1 text-sm text-slate-500">관심 대회와 신청 완료 표시도 다른 사용자에게 공개되지 않습니다.</p>
            </div>
          </div>
          <Button variant="outline" size="lg" className="h-12 w-full shrink-0 border-emerald-300 bg-white px-5 text-base font-black text-emerald-900 sm:w-auto" onClick={openProfileEditor}>
            <UserRound aria-hidden="true" /> {hasProfile(profile) ? '내 정보 보기·수정' : '내 정보 등록'}
          </Button>
        </section>

        <section aria-labelledby="filter-heading" className="mb-5 rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 font-black text-emerald-900"><Sparkles className="size-5" aria-hidden="true" />{profile.region ? `${profile.region} 대회 우선` : '내 지역 대회 먼저 보기'}</p>
              <p className="text-sm text-slate-600">{profile.region ? '내 정보에 등록한 지역을 먼저 보여드려요.' : '내 정보에서 활동 지역을 등록해 주세요.'}</p>
            </div>
            <Button variant="ghost" size="lg" className="h-12 shrink-0 px-3 text-base" onClick={() => setFilters(emptyFilters)}>
              <RotateCcw aria-hidden="true" /> 초기화
            </Button>
          </div>
          <h2 id="filter-heading" className="sr-only">대회 검색과 필터</h2>
          <label htmlFor="event-search" className="sr-only">대회명 또는 지역 검색</label>
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <Input id="event-search" className="h-14 rounded-2xl border-slate-300 bg-slate-50 pl-12 text-lg md:text-lg" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} placeholder="대회명, 지역, 경기장 검색" type="search" />
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect label="지역" value={filters.region} onChange={(value) => setFilters({ ...filters, region: value })} options={regions} />
            <FilterSelect label="접수 상태" value={filters.status} onChange={(value) => setFilters({ ...filters, status: value })} options={REGISTRATION_STATUSES} />
            <FilterSelect label="참가 자격" value={filters.eligibility} onChange={(value) => setFilters({ ...filters, eligibility: value })} options={ELIGIBILITY_OPTIONS} />
            <FilterSelect label="경기 구분" value={filters.competitionType} onChange={(value) => setFilters({ ...filters, competitionType: value })} options={['개인전', '단체전']} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
            <label htmlFor="event-date-start" className="grid gap-1.5 text-sm font-bold text-slate-700">개최일 시작<Input id="event-date-start" type="date" className="h-12 rounded-xl bg-white text-base md:text-base" value={filters.dateStart} onChange={(event) => setFilters({ ...filters, dateStart: event.target.value })} /></label>
            <label htmlFor="event-date-end" className="grid gap-1.5 text-sm font-bold text-slate-700">개최일 끝<Input id="event-date-end" type="date" className="h-12 rounded-xl bg-white text-base md:text-base" value={filters.dateEnd} onChange={(event) => setFilters({ ...filters, dateEnd: event.target.value })} /></label>
            <div className="grid gap-1.5">
              <span className="text-sm font-bold text-slate-700">정렬</span>
              <Select value={sort} onValueChange={(value) => value && setSort(value as 'event' | 'registration')}>
                <SelectTrigger aria-label="정렬" className="h-12 w-full rounded-xl border-slate-300 bg-white px-3 text-base"><SelectValue>{sort === 'event' ? '개최일 최신순' : '접수 마감일순'}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="event">개최일 최신순</SelectItem>
                  <SelectItem value="registration">접수 마감일순</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label htmlFor="nearby-only" className={`flex h-12 items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-base font-black text-emerald-900 ${profile.region ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
              <Checkbox id="nearby-only" checked={filters.nearbyOnly} disabled={!profile.region} onCheckedChange={(checked) => setFilters({ ...filters, nearbyOnly: checked === true })} className="size-5" />
              내 지역만
            </label>
          </div>
          <p className="mt-2 text-sm text-slate-500">정렬: {sort === 'event' ? '개최일 최신순' : '접수 마감일순'} · 모든 날짜는 한국시간 기준</p>
        </section>

        <div className="mx-auto mb-4 flex w-full min-w-0 max-w-4xl flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold text-emerald-700">지금 확인할 대회</p>
            <h2 className="text-2xl font-black tracking-tight">{data ? `${shownEvents.length}개를 찾았어요` : '대회를 찾고 있어요'}</h2>
          </div>
          <Tabs className="w-full min-w-0 sm:w-auto" value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
            <TabsList className="grid h-12 w-full grid-cols-3 rounded-xl bg-emerald-100 p-1 sm:flex sm:w-auto">
              <TabsTrigger className="min-w-0 px-2 text-base font-bold sm:px-4" value="all">전체</TabsTrigger>
              <TabsTrigger className="min-w-0 px-2 text-base font-bold sm:px-4" value="favorites">관심 {favorites.size}</TabsTrigger>
              <TabsTrigger className="min-w-0 px-2 text-base font-bold sm:px-4" value="applied">신청 {applied.size}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <section className="location-panel mx-auto mb-4 w-full min-w-0 max-w-4xl" aria-labelledby="location-heading">
          <div className="flex min-w-0 items-start gap-3">
            <span className="location-icon" aria-hidden="true"><Car /></span>
            <div className="min-w-0">
              <h2 id="location-heading" className="text-lg font-black text-emerald-950">경기장까지 자동차 거리</h2>
              <p className="text-base text-slate-700" aria-live="polite">
                {locationMessage || '버튼을 누르면 내 위치에서 각 경기장까지 거리와 예상 시간을 보여드려요.'}
              </p>
              <p className="mt-1 text-sm text-slate-500">위치는 저장하지 않으며, 거리 계산을 위해서만 사용합니다.</p>
            </div>
          </div>
          <Button size="lg" className="h-13 w-full shrink-0 rounded-xl px-5 text-base font-black sm:w-auto" onClick={requestLocation} disabled={locationStatus === 'requesting'}>
            {locationStatus === 'requesting' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <LocateFixed aria-hidden="true" />}
            {locationStatus === 'ready' ? '거리 다시 계산' : locationStatus === 'requesting' ? '위치 확인 중' : '내 위치로 거리 보기'}
          </Button>
        </section>

        {error ? (
          <div role="alert" className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-lg font-bold text-rose-900"><AlertTriangle className="mb-2 size-7" aria-hidden="true" />{error}</div>
        ) : !data ? (
          <div aria-live="polite" className="mx-auto grid max-w-4xl gap-3">{[1, 2, 3].map((item) => <div key={item} className="h-72 animate-pulse rounded-3xl bg-emerald-100/70" />)}</div>
        ) : shownEvents.length === 0 ? (
          <Empty className="min-h-72 border-2 border-emerald-200 bg-white">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Search /></EmptyMedia>
              <EmptyTitle className="text-xl font-black">조건에 맞는 대회가 없어요</EmptyTitle>
              <EmptyDescription className="text-base">필터를 초기화하거나 다른 날짜·지역으로 찾아보세요. 현재 접수 중인 대회가 없다면 새 공고가 등록될 때까지 정확히 0개로 표시됩니다.</EmptyDescription>
            </EmptyHeader>
            <Button size="lg" className="h-12 px-5 text-base" onClick={() => { setFilters(emptyFilters); setViewMode('all'); }}>전체 대회 보기</Button>
          </Empty>
        ) : (
          <div className="mx-auto grid w-full min-w-0 max-w-4xl items-start gap-5">
            {shownEvents.map((event) => {
              const status = computeStatus(event);
              const eventConflicts = conflicts.get(event.id) ?? [];
              const favorite = favorites.has(event.id);
              const isApplied = applied.has(event.id);
              const destination = event.venue_location;
              const routeKey = destination ? `${destination.latitude},${destination.longitude}` : '';
              const routeState = routeKey ? routes[routeKey] : undefined;
              const directionsUrl = destination
                ? `https://map.kakao.com/link/to/${encodeURIComponent(event.venue)},${destination.latitude},${destination.longitude}`
                : `https://map.kakao.com/link/search/${encodeURIComponent(event.venue)}`;
              return (
                <article key={event.id} className={`event-card ${status === '접수 중' || status === '마감 임박' ? 'event-card-open' : ''}`}>
                  <div className="relative z-10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={`h-auto px-3 py-1.5 text-sm font-black ${statusStyle[status]}`}>{status}</Badge>
                        {isHomeRegion(event, profile.region) && <span className="rounded-full bg-lime-100 px-3 py-1 text-sm font-black text-lime-900">내 지역</span>}
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-800">{event.region || '전국'}</span>
                      </div>
                      <Button variant={favorite ? 'default' : 'outline'} size="icon-lg" className="size-12 shrink-0 rounded-full" aria-label={favorite ? `${event.name} 관심 해제` : `${event.name} 관심 저장`} aria-pressed={favorite} onClick={() => toggle(setFavorites, event.id)}>
                        <Heart className={favorite ? 'fill-current' : ''} aria-hidden="true" />
                      </Button>
                    </div>

                    <h3 className="mt-4 break-words text-[1.4rem] font-black leading-snug tracking-[-0.025em]">{event.name}</h3>
                    <div className="mt-4 grid gap-3 text-[1rem] leading-relaxed text-slate-700">
                      <p className="icon-row"><CalendarDays aria-hidden="true" /><span><strong>개최일</strong><br />{formatPeriod(event.event_start, event.event_end)}</span></p>
                      <p className="icon-row"><MapPin aria-hidden="true" /><span><strong>경기장</strong><br />{event.venue}</span></p>
                      {locationStatus === 'ready' && (
                        <div className="route-row">
                          <Car aria-hidden="true" />
                          <span className="min-w-0">
                            <strong>자동차 이동</strong><br />
                            {!destination ? (
                              <span>경기장 주소가 부족해 자동 계산은 어려워요.</span>
                            ) : routeState?.status === 'ready' ? (
                              <span className="route-result">{formatDrivingRoute(routeState.route)}</span>
                            ) : routeState?.status === 'error' ? (
                              <span>{routeState.message}</span>
                            ) : (
                              <span className="inline-flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />거리 계산 중…</span>
                            )}
                          </span>
                          <a href={directionsUrl} target="_blank" rel="noreferrer" className="route-link">
                            <Navigation aria-hidden="true" /> 길찾기
                          </a>
                        </div>
                      )}
                      <p className="icon-row"><Clock3 aria-hidden="true" /><span><strong>접수 마감</strong><br />{formatDate(event.registration_end, true)}</span></p>
                      <p className="icon-row"><Users aria-hidden="true" /><span><strong>참가 자격</strong><br />{event.eligibility.join(' · ') || '참가 자격 확인 필요'}</span></p>
                    </div>

                    {hasProfile(profile) && (
                      <details className="my-info-details mt-4">
                        <summary><UserRound aria-hidden="true" />신청할 때 내 정보 보기</summary>
                        <div className="my-info-content">
                          <p className="font-bold text-slate-800">{profileSummary(profile)}</p>
                          {profile.membershipNumber && <p className="mt-2 break-all text-base font-black text-emerald-950">협회 회원번호: {profile.membershipNumber}</p>}
                          <p className="mt-1 text-sm text-slate-600">이 기기에만 표시되며 접수 페이지로 자동 전달되지 않아요.</p>
                          <Button type="button" variant="link" className="mt-1 h-10 px-0 text-base font-black text-emerald-800" onClick={openProfileEditor}>내 정보 수정</Button>
                        </div>
                      </details>
                    )}

                    {eventConflicts.length > 0 && (
                      <div role="alert" className="mt-4 flex gap-2 rounded-2xl border border-orange-300 bg-orange-50 p-3 font-bold text-orange-950">
                        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                        <span>일정 겹침: {eventConflicts.join(', ')}</span>
                      </div>
                    )}

                    <div className="mt-5 grid gap-2 sm:grid-cols-2">
                      <Button variant={isApplied ? 'default' : 'outline'} size="lg" className="h-13 rounded-xl text-base font-black" aria-pressed={isApplied} onClick={() => toggle(setApplied, event.id)}>
                        {isApplied ? <CheckCircle2 aria-hidden="true" /> : <Check aria-hidden="true" />}{isApplied ? '신청 완료됨' : '신청 완료 표시'}
                      </Button>
                      {event.registration_url ? (
                        <a href={event.registration_url} target="_blank" rel="noreferrer" className={buttonVariants({ size: 'lg', className: 'h-13 rounded-xl bg-emerald-700 text-base font-black text-white hover:bg-emerald-800' })}>
                          접수 페이지 <ExternalLink aria-hidden="true" />
                        </a>
                      ) : (
                        <Button size="lg" className="h-13 rounded-xl text-base" disabled>접수처 확인 필요</Button>
                      )}
                    </div>

                    <Accordion className="mt-3">
                      <AccordionItem value="details" className="border-0">
                        <AccordionTrigger className="min-h-12 rounded-xl bg-emerald-50 px-4 text-base font-black text-emerald-950 hover:no-underline">세부 정보 모두 보기</AccordionTrigger>
                        <AccordionContent className="pt-3 text-base">
                          <dl className="detail-list">
                            <DetailRow label="전체 대회 기간" value={formatPeriod(event.event_start, event.event_end)} />
                            <DetailRow label="예선 날짜" value={formatDateList(event.preliminary_dates)} />
                            <DetailRow label="결선 날짜" value={formatDateList(event.final_dates)} />
                            <DetailRow label="접수 시작" value={formatDate(event.registration_start, true)} />
                            <DetailRow label="접수 마감" value={formatDate(event.registration_end, true)} />
                            <DetailRow label="모집 인원" value={display(event.capacity)} />
                            <DetailRow label="참가 대상·자격" value={display(event.eligibility_notes) !== '확인 필요' ? event.eligibility_notes : event.eligibility.join(', ') || '확인 필요'} />
                            <DetailRow label="협회 회원가입" value={event.association_membership_required === true ? '필요' : event.association_membership_required === false ? '불필요' : '확인 필요'} />
                            <DetailRow label="접수 단위" value={display(event.registration_type)} />
                            <DetailRow label="경기 구분" value={event.competition_type.join(', ') || '확인 필요'} />
                            <DetailRow label="참가비" value={display(event.fee)} />
                            <DetailRow label="주최" value={display(event.host)} />
                            <DetailRow label="주관" value={display(event.organizer)} />
                            <DetailRow label="문의 전화" value={event.contact ? <a className="font-bold text-emerald-800 underline" href={telephoneHref(event.contact)}><Phone className="mr-1 inline size-4" aria-hidden="true" />{event.contact}</a> : '확인 필요'} />
                            <DetailRow label="접수 방법" value={display(event.registration_method)} />
                            <DetailRow label="공고 게시일" value={formatDate(event.announcement_date)} />
                          </dl>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <a href={event.announcement_url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'outline', size: 'lg', className: 'h-12 text-base font-black' })}><FileText aria-hidden="true" />공식 공고 보기</a>
                            {event.attachments[0] && <a href={event.attachments[0].url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'outline', size: 'lg', className: 'h-12 text-base font-black' })}><ExternalLink aria-hidden="true" />첨부 요강 보기</a>}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>

                  </div>
                </article>
              );
            })}
          </div>
        )}

        {data && (
          <footer className="mt-8 rounded-3xl border border-emerald-200 bg-white p-5">
            <div className="flex items-start gap-3">
              <Trophy className="mt-1 size-6 shrink-0 text-emerald-700" aria-hidden="true" />
              <div>
                <h2 className="text-lg font-black">수집 정보</h2>
                <p className="text-slate-700">마지막 수집: {formatDate(data.meta.generated_at, true)} · 총 {data.meta.event_count}개</p>
                <p className="text-sm text-slate-600">자동수집 오류 {failedSources}곳. 오류가 있어도 이전 정상 데이터는 유지됩니다.</p>
              </div>
            </div>
            <Accordion className="mt-3">
              <AccordionItem value="sources" className="border-0">
                <AccordionTrigger className="min-h-12 rounded-xl border px-4 text-base font-bold hover:no-underline">출처별 상태 보기</AccordionTrigger>
                <AccordionContent className="pt-3 text-base">
                  <ul className="grid gap-2">
                    {data.meta.source_statuses.map((source) => (
                      <li key={source.id} className="flex flex-col gap-1 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div><a href={source.url} target="_blank" rel="noreferrer" className="font-black text-emerald-800 underline">{source.name}</a><p className="text-sm text-slate-600">{source.message}</p></div>
                        <span className="shrink-0 text-sm font-bold">{source.status === 'success' ? '자동수집 성공' : source.status === 'manual_required' ? '수동 확인 필요' : '수집 실패'}</span>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            <p className="mt-4 flex items-start gap-2 text-sm text-slate-500"><ChevronRight className="mt-0.5 size-4 shrink-0" aria-hidden="true" />참가 전에 공식 공고에서 자격, 접수 시간, 참가비를 한 번 더 확인해 주세요.</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm font-bold">
              <a href={`${basePath}/privacy/`} className="text-emerald-800 underline underline-offset-4">개인정보 안내</a>
              <span className="text-slate-500">광고·로그인 기능은 현재 연결되어 있지 않습니다.</span>
            </div>
          </footer>
        )}
      </section>
      </main>
    </>
  );
}
