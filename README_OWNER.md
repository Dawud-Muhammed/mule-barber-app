# Mule Barber Queue Dashboard — Owner's Guide

## Sign In

1. Open **https://yourdomain.com/login** (or localhost:3000/login for testing)
2. Enter your email and password
3. You'll see the live queue dashboard

---

## Three Main Actions

### ✓ Complete Customer
When you finish serving someone:
- Click **✓ Complete Customer** on the "Now Serving" card
- Next person in the queue automatically moves to "Now Serving"
- They get a "You're up next!" notification on Telegram

### ⊘ Skip (No-show)
If someone doesn't show up:
- Click **⊘ Skip (No-show)** on the "Now Serving" card
- They move to "Skipped Today" section (can requeue later)
- Next person moves to "Now Serving"

### Cancel or Requeue
From the waiting list:
- **Skip** — Remove someone from the queue (they go to "Skipped Today" and can rejoin)
- **Cancel** — Remove someone completely (they have to restart from /start in Telegram)
- **Requeue** — Put a skipped person back at the end of the waiting list

---

## Toggle Queue Status

At the top right of the dashboard:
- **Queue Open** = accepting new clients from Telegram
- **Queue Closed** = clients see "We're not taking walk-ins right now"

Toggle this if you need a break or to manage capacity.

---

## What You'll See

**Now Serving (Top Card)**
- Large queue number
- Customer name (or "Guest")
- Service type (Haircut, Beard, etc.)
- Buttons to complete or skip

**Waiting Queue**
- List of customers in order
- Their queue number
- Time they joined
- Skip/Cancel buttons for each

**Skipped Today (if any)**
- Customers who didn't show up
- Requeue button to put them back in line

---

## What Customers See

1. **On Telegram:** They message @YourBotName
2. **/start** → Pick a service → Confirm → Get a queue number
3. **"Check my position"** → See where they are in the queue
4. **Auto-notifications:**
   - When 3 or fewer ahead: "You're getting close!"
   - When they're up next: "You're up next! Come on in."

---

## If Something Goes Wrong

- **Customer not showing up in the list?**
  - Refresh the page (button at bottom)
  - They might be in a past session; only today's queue shows

- **Notification didn't send?**
  - Small ⚠️ icon appears next to their name
  - Next action will auto-retry
  - You can call them manually if needed

- **Connection drops?**
  - You'll see "Connection lost — reconnecting..."
  - Auto-reconnects in a few seconds
  - No data is lost

---

## Tips

- **All day counter display:** Leave the dashboard open all day
- **On phone/tablet:** Works great on any device
- **Real-time sync:** You'll see customers join as soon as they text the bot
- **No manual refresh needed:** Everything updates automatically

---

## Support

Questions? See the main **PROJECT_STATUS.md** for technical details.

Enjoy managing your queue! 🎉
