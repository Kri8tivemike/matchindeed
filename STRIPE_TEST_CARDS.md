# Stripe Test Mode - Demo Card Data Guide

## ✅ Yes, You Can Use Test Mode with Demo Cards!

Stripe provides official test card numbers that work in **TEST MODE** only. These cards will **never** charge real money.

## 🔑 Prerequisites

To use test mode, ensure you're using **test API keys** from your Stripe Dashboard:

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys)
2. Make sure you're in **Test mode** (toggle in top right)
3. Copy your **Test Publishable Key** and **Test Secret Key**
4. Add them to your `.env.local` file:

```env
# Stripe Test Keys (for development)
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

## 💳 Official Stripe Test Card Numbers

### ✅ Successful Payment Cards

| Card Number | Description | Use Case |
|------------|-------------|----------|
| `4242 4242 4242 4242` | Visa (most common) | General testing |
| `5555 5555 5555 4444` | Mastercard | General testing |
| `3782 822463 10005` | American Express | Amex testing |
| `6011 1111 1111 1117` | Discover | Discover testing |

### 📅 Expiry Date
- Use any **future date** (e.g., `12/34` or `12/25`)
- Month: `01` to `12`
- Year: Any year in the future

### 🔒 CVC/CVV
- Use any **3 digits** for Visa/Mastercard (e.g., `123`)
- Use any **4 digits** for American Express (e.g., `1234`)

### 📝 Cardholder Name
- Use any name (e.g., `Test User`)

### 🌍 ZIP/Postal Code
- Use any valid format (e.g., `12345` for US, `SW1A 1AA` for UK)

## 🧪 Testing Different Scenarios

### Successful Payments
Use any of the cards above with:
- **Expiry**: Any future date
- **CVC**: Any 3-4 digits
- **ZIP**: Any valid format

### Declined Payments
| Card Number | Scenario |
|------------|----------|
| `4000 0000 0000 0002` | Card declined (generic decline) |
| `4000 0000 0000 9995` | Insufficient funds |
| `4000 0000 0000 0069` | Expired card |

### 3D Secure Authentication
| Card Number | Scenario |
|------------|----------|
| `4000 0025 0000 3155` | Requires authentication |
| `4000 0027 6000 3184` | Authentication succeeds |
| `4000 0082 6000 3178` | Authentication fails |

### Special Cases
| Card Number | Scenario |
|------------|----------|
| `4000 0000 0000 3220` | Processing error |
| `4000 0000 0000 3055` | Incorrect CVC |
| `4000 0000 0000 0341` | Attach payment method to customer |

## 🚫 Invalid Card Numbers (Will Show Error)

These numbers will **NOT** work, even in test mode:
- `1234 1234 1234 1234` ❌ (What you tried - not a valid Stripe test card)
- `0000 0000 0000 0000` ❌
- `1111 1111 1111 1111` ❌
- Any random number sequence ❌

## ✅ Quick Test Example

For your **Standard Plan** subscription test:

```
Card Number: 4242 4242 4242 4242
Expiry: 12/34
CVC: 123
Cardholder Name: Test User
ZIP: 12345
```

This will successfully process in test mode!

## 🔍 Verifying Test Mode

You can verify you're in test mode by:

1. **Check the Stripe Checkout page** - Should show "TEST MODE" badge (like in your image)
2. **Check your Stripe Dashboard** - URL should contain `/test/` 
3. **Check API keys** - Test keys start with `sk_test_` and `pk_test_`

## 📚 Additional Resources

- [Stripe Test Cards Documentation](https://stripe.com/docs/testing)
- [Stripe Testing Guide](https://stripe.com/docs/testing)
- [All Test Card Numbers](https://stripe.com/docs/testing#cards)

## ⚠️ Important Notes

1. **Test mode only** - These cards only work with test API keys
2. **No real charges** - Test cards never charge real money
3. **Test data** - All transactions appear in your Stripe Dashboard under "Test mode"
4. **Switch to live** - When ready for production, switch to live API keys (`sk_live_` and `pk_live_`)
