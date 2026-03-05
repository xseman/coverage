package fixture

import "testing"

// Head tests: covers Add, Subtract, Multiply, Reverse, Capitalize, Truncate
// Does NOT cover: Divide, Modulo, PadLeft

func TestAdd(t *testing.T) {
	if Add(1, 2) != 3 {
		t.Fatal("expected 3")
	}
}

func TestSubtract(t *testing.T) {
	if Subtract(5, 3) != 2 {
		t.Fatal("expected 2")
	}
}

func TestMultiply(t *testing.T) {
	if Multiply(3, 4) != 12 {
		t.Fatal("expected 12")
	}
}

func TestReverse(t *testing.T) {
	if Reverse("hello") != "olleh" {
		t.Fatal("expected olleh")
	}
}

func TestCapitalize(t *testing.T) {
	if Capitalize("hello") != "Hello" {
		t.Fatal("expected Hello")
	}
}

func TestTruncate(t *testing.T) {
	if Truncate("hello world", 5) != "hello..." {
		t.Fatal("expected hello...")
	}
}
