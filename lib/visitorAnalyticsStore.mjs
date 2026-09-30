import {
  FieldValue,
  Firestore,
  Timestamp,
} from "@google-cloud/firestore";

function lagosParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map(part => [part.type, part.value])
  );

  return {
    day: `${values.year}-${values.month}-${values.day}`,
    month: `${values.year}-${values.month}`,
  };
}

function emptyStats() {
  return {
    daily_users: 0,
    new_users_today: 0,
    monthly_users: 0,
    total_unique_users: 0,
    active_users: 0,
    latest_new_user_at: null,
  };
}

export class VisitorAnalyticsStore {
  constructor({
    enabled = false,
    collection = "petitiondesk_visitors",
    projectId =
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      undefined,
  } = {}) {
    this.enabled = Boolean(enabled);
    this.memory = new Map();

    if (this.enabled) {
      this.db = new Firestore({
        ignoreUndefinedProperties: true,
        ...(projectId ? { projectId } : {}),
      });

      this.collection = this.db.collection(
        String(collection || "petitiondesk_visitors")
          .trim()
          .replace(/[^a-zA-Z0-9_-]/g, "_")
      );
    } else {
      this.db = null;
      this.collection = null;
    }
  }

  async record(visitorHash) {
    const clean = String(visitorHash || "").trim();
    if (!clean) return { tracked: false, isNew: false };

    const now = new Date();
    const { day, month } = lagosParts(now);

    if (!this.enabled) {
      const previous = this.memory.get(clean);
      this.memory.set(clean, {
        firstSeen: previous?.firstSeen || now,
        firstDay: previous?.firstDay || day,
        lastSeen: now,
        lastDay: day,
        lastMonth: month,
      });
      return { tracked: true, isNew: !previous };
    }

    const reference = this.collection.doc(clean);
    const isNew = await this.db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);

      if (snapshot.exists) {
        transaction.set(reference, {
          lastSeen: Timestamp.fromDate(now),
          lastDay: day,
          lastMonth: month,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return false;
      }

      transaction.create(reference, {
        firstSeen: Timestamp.fromDate(now),
        firstDay: day,
        firstMonth: month,
        lastSeen: Timestamp.fromDate(now),
        lastDay: day,
        lastMonth: month,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return true;
    });

    return { tracked: true, isNew };
  }

  async stats() {
    const now = new Date();
    const { day, month } = lagosParts(now);
    const activeSince = new Date(now.getTime() - 5 * 60 * 1000);

    if (!this.enabled) {
      const values = [...this.memory.values()];
      const latest = values
        .map(value => value.firstSeen)
        .sort((a, b) => b - a)[0];

      return {
        daily_users: values.filter(value => value.lastDay === day).length,
        new_users_today: values.filter(value => value.firstDay === day).length,
        monthly_users: values.filter(value => value.lastMonth === month).length,
        total_unique_users: values.length,
        active_users: values.filter(value => value.lastSeen >= activeSince).length,
        latest_new_user_at: latest?.toISOString?.() || null,
      };
    }

    try {
      const [daily, newToday, monthly, total, active, latest] =
        await Promise.all([
          this.collection.where("lastDay", "==", day).count().get(),
          this.collection.where("firstDay", "==", day).count().get(),
          this.collection.where("lastMonth", "==", month).count().get(),
          this.collection.count().get(),
          this.collection.where(
            "lastSeen",
            ">=",
            Timestamp.fromDate(activeSince)
          ).count().get(),
          this.collection.orderBy("firstSeen", "desc").limit(1).get(),
        ]);

      const latestData = latest.docs[0]?.data?.() || {};
      const latestDate = latestData.firstSeen?.toDate?.();

      return {
        daily_users: Number(daily.data().count || 0),
        new_users_today: Number(newToday.data().count || 0),
        monthly_users: Number(monthly.data().count || 0),
        total_unique_users: Number(total.data().count || 0),
        active_users: Number(active.data().count || 0),
        latest_new_user_at: latestDate?.toISOString?.() || null,
      };
    } catch (error) {
      console.error("Visitor analytics read error:", error?.message || error);
      return emptyStats();
    }
  }
}
