'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  Heart,
  Info,
  MapPin,
  Phone,
  RotateCcw,
  Search,
  Sparkles,
  Trophy,
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
  isNearby,
  sortEvents,
  type EventFilters,
  type EventItem,
  type RegistrationStatus,
  type TrustStatus,
} from '@/lib/events';

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

type SavedState = { favorites: string[]; applied: string[] };
type ViewMode = 'all' | 'favorites' | 'applied';

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

const dataUrl = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/data/events.json`;
const STORAGE_KEY = 'park-golf-finder:v1';

const emptyFilters: EventFilters = {
  query: '',
  region: '',
  dateStart: '',
  dateEnd: '',
  status: '',
  eligibility: '',
  competitionType: '',
  nearbyOnly: true,
};

const statusStyle: Record<RegistrationStatus, string> = {
  '접수 예정': 'bg-sky-100 text-sky-900 border-sky-200',
  '접수 중': 'bg-emerald-600 text-white border-emerald-600',
  '마감 임박': 'bg-orange-500 text-white border-orange-500',
  '접수 마감': 'bg-slate-200 text-slate-800 border-slate-300',
  '대회 종료': 'bg-slate-700 text-white border-slate-700',
};

const trustStyle: Record<TrustStatus, string> = {
  '공식 확인': 'text-emerald-800 bg-emerald-50',
  '공식 공고에서 자동수집': 'text-emerald-800 bg-emerald-50',
  '사람이 직접 등록': 'text-blue-800 bg-blue-50',
  '세부 내용 확인 필요': 'text-amber-900 bg-amber-50',
  '링크 오류 또는 접수처 확인 필요': 'text-rose-900 bg-rose-50',
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

export default function Home() {
  const [data, setData] = useState<EventFile | null>(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<EventFilters>(emptyFilters);
  const [sort, setSort] = useState<'event' | 'registration'>('event');
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [storageReady, setStorageReady] = useState(false);

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
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setStorageReady(true);
    }
  }, []);
  /* oxlint-enable react/react-compiler */

  useEffect(() => {
    if (!storageReady) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ favorites: [...favorites], applied: [...applied] }));
  }, [favorites, applied, storageReady]);

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
    const filtered = filterEvents(allEvents, filters).filter((event) => {
      if (viewMode === 'favorites') return favorites.has(event.id);
      if (viewMode === 'applied') return applied.has(event.id);
      return true;
    });
    return sortEvents(filtered, sort);
  }, [allEvents, filters, sort, viewMode, favorites, applied]);

  const openCount = allEvents.filter((event) => ['접수 중', '마감 임박'].includes(computeStatus(event))).length;
  const failedSources = data?.meta.source_statuses.filter((source) => source.status === 'failed').length ?? 0;

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="scoreboard-band">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-6 sm:py-5">
          <div>
            <p className="eyebrow">경주에서 출발하는 전국 대회 찾기</p>
            <h1 className="text-2xl font-black tracking-[-0.035em] sm:text-4xl">파크골프 대회 찾기</h1>
            <p className="mt-1 text-sm font-semibold text-emerald-50 sm:text-base">동경주클럽 · 대한파크골프협회 회원 기준</p>
          </div>
          <div className="hole-mark" aria-hidden="true"><span>18</span></div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-5 sm:px-6">
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="summary-tile summary-primary"><span>접수 가능</span><strong>{data ? `${openCount}개` : '—'}</strong></div>
          <div className="summary-tile"><span>관심 대회</span><strong>{favorites.size}개</strong></div>
          <div className="summary-tile col-span-2 sm:col-span-1"><span>신청 완료</span><strong>{applied.size}개</strong></div>
        </div>

        <section aria-labelledby="filter-heading" className="mb-5 rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 font-black text-emerald-900"><Sparkles className="size-5" aria-hidden="true" />경주 인접 지역 우선</p>
              <p className="text-sm text-slate-600">경북·경남·대구·울산을 먼저 보여드려요.</p>
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
                <SelectTrigger aria-label="정렬" className="h-12 w-full rounded-xl border-slate-300 bg-white px-3 text-base"><SelectValue>{sort === 'event' ? '개최일순' : '접수 마감일순'}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="event">개최일순</SelectItem>
                  <SelectItem value="registration">접수 마감일순</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label htmlFor="nearby-only" className="flex h-12 cursor-pointer items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-base font-black text-emerald-900">
              <Checkbox id="nearby-only" checked={filters.nearbyOnly} onCheckedChange={(checked) => setFilters({ ...filters, nearbyOnly: checked === true })} className="size-5" />
              인접 지역만
            </label>
          </div>
          <p className="mt-2 text-sm text-slate-500">정렬: {sort === 'event' ? '개최일순' : '접수 마감일순'} · 모든 날짜는 한국시간 기준</p>
        </section>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold text-emerald-700">지금 확인할 대회</p>
            <h2 className="text-2xl font-black tracking-tight">{data ? `${shownEvents.length}개를 찾았어요` : '대회를 찾고 있어요'}</h2>
          </div>
          <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
            <TabsList className="h-12 w-full rounded-xl bg-emerald-100 p-1 sm:w-auto">
              <TabsTrigger className="px-4 text-base font-bold" value="all">전체</TabsTrigger>
              <TabsTrigger className="px-4 text-base font-bold" value="favorites">관심 {favorites.size}</TabsTrigger>
              <TabsTrigger className="px-4 text-base font-bold" value="applied">신청 {applied.size}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {error ? (
          <div role="alert" className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-lg font-bold text-rose-900"><AlertTriangle className="mb-2 size-7" aria-hidden="true" />{error}</div>
        ) : !data ? (
          <div aria-live="polite" className="grid gap-3 lg:grid-cols-2">{[1, 2, 3, 4].map((item) => <div key={item} className="h-72 animate-pulse rounded-3xl bg-emerald-100/70" />)}</div>
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
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {shownEvents.map((event) => {
              const status = computeStatus(event);
              const eventConflicts = conflicts.get(event.id) ?? [];
              const favorite = favorites.has(event.id);
              const isApplied = applied.has(event.id);
              return (
                <article key={event.id} className={`event-card ${status === '접수 중' || status === '마감 임박' ? 'event-card-open' : ''}`}>
                  <div className="relative z-10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={`h-auto px-3 py-1.5 text-sm font-black ${statusStyle[status]}`}>{status}</Badge>
                        {isNearby(event) && <span className="rounded-full bg-lime-100 px-3 py-1 text-sm font-black text-lime-900">경주 우선</span>}
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-800">{event.region || '전국'}</span>
                      </div>
                      <Button variant={favorite ? 'default' : 'outline'} size="icon-lg" className="size-12 shrink-0 rounded-full" aria-label={favorite ? `${event.name} 관심 해제` : `${event.name} 관심 저장`} aria-pressed={favorite} onClick={() => toggle(setFavorites, event.id)}>
                        <Heart className={favorite ? 'fill-current' : ''} aria-hidden="true" />
                      </Button>
                    </div>

                    <h3 className="mt-4 text-[1.4rem] font-black leading-snug tracking-[-0.025em]">{event.name}</h3>
                    <div className="mt-4 grid gap-3 text-[1rem] leading-relaxed text-slate-700">
                      <p className="icon-row"><CalendarDays aria-hidden="true" /><span><strong>개최일</strong><br />{formatPeriod(event.event_start, event.event_end)}</span></p>
                      <p className="icon-row"><MapPin aria-hidden="true" /><span><strong>경기장</strong><br />{event.venue}</span></p>
                      <p className="icon-row"><Clock3 aria-hidden="true" /><span><strong>접수 마감</strong><br />{formatDate(event.registration_end, true)}</span></p>
                      <p className="icon-row"><Users aria-hidden="true" /><span><strong>참가 자격</strong><br />{event.eligibility.join(' · ') || '참가 자격 확인 필요'}</span></p>
                    </div>

                    {eventConflicts.length > 0 && (
                      <div role="alert" className="mt-4 flex gap-2 rounded-2xl border border-orange-300 bg-orange-50 p-3 font-bold text-orange-950">
                        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                        <span>일정 겹침: {eventConflicts.join(', ')}</span>
                      </div>
                    )}

                    <div className="mt-5 grid grid-cols-2 gap-2">
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

                    <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm ${trustStyle[event.trust_status]}`}>
                      <span className="flex items-center gap-1.5 font-black"><Info className="size-4" aria-hidden="true" />{event.trust_status}</span>
                      <span>{event.source_type} · {event.source_name} · {formatDate(event.last_checked_at, true)} 확인</span>
                    </div>
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
            <p className="mt-4 flex items-start gap-2 text-sm text-slate-500"><ChevronRight className="mt-0.5 size-4 shrink-0" aria-hidden="true" />참가 전에 공식 공고에서 자격, 접수 시간, 참가비를 한 번 더 확인해 주세요. 이 사이트에는 이름·연락처 같은 개인정보를 저장하지 않습니다.</p>
          </footer>
        )}
      </section>
    </main>
  );
}
